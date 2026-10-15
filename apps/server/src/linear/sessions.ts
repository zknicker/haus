import type { LinearSessionStatus } from '@haus/api';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { linearAgentSessionsTable } from '../postgres/schema.ts';
import { retireLinearSessionItems } from './session-inbox.ts';

// Linear session records (specs/linear-app.md#session-records-and-state): Linear's
// session id under a Haus handle `lss_…`, its receiving actor, routed Agent,
// anchor DM, issue, and status.

export type LinearSessionRecord = typeof linearAgentSessionsTable.$inferSelect;

/** Statuses a session leaves only through a new `prompted` event (`complete`) or never. */
export type LinearSessionClosure = Exclude<LinearSessionStatus, 'active'>;
const openStatuses: LinearSessionStatus[] = ['active', 'complete'];

export async function findLinearSession(
    tx: HausDatabase,
    input: { linearSessionId: string; workspaceId: string }
): Promise<LinearSessionRecord | null> {
    const [row] = await tx
        .select()
        .from(linearAgentSessionsTable)
        .where(
            and(
                eq(linearAgentSessionsTable.workspaceId, input.workspaceId),
                eq(linearAgentSessionsTable.linearSessionId, input.linearSessionId)
            )
        )
        .limit(1);
    return row ?? null;
}

/** Records a session Linear just created, `active`, under a fresh handle. */
export async function createLinearSession(
    tx: HausDatabase,
    input: {
        agentId: string | null;
        anchorChatId: string;
        identityId: string | null;
        issueId: string;
        issueIdentifier: string;
        linearSessionId: string;
        now: Date;
        serverId: string;
        workspaceId: string;
    }
): Promise<LinearSessionRecord> {
    const [row] = await tx
        .insert(linearAgentSessionsTable)
        .values({
            agentId: input.agentId,
            anchorChatId: input.anchorChatId,
            id: createOpaqueId('lss'),
            identityId: input.identityId,
            issueId: input.issueId,
            issueIdentifier: input.issueIdentifier,
            lastEventAt: input.now,
            linearSessionId: input.linearSessionId,
            serverId: input.serverId,
            status: 'active',
            workspaceId: input.workspaceId,
        })
        .returning();
    if (!row) {
        throw new Error('Failed to record the Linear session.');
    }
    return row;
}

/**
 * A new event on a known session: the routed Agent and anchor may change
 * (Haus app sessions route per event) and a `complete` session reopens. When
 * the Agent changes, the old Agent's unserved rows for it retire.
 */
export async function touchLinearSession(
    tx: HausDatabase,
    session: LinearSessionRecord,
    input: { agentId: string | null; anchorChatId: string; now: Date; reopen: boolean }
): Promise<LinearSessionRecord> {
    const reopen = input.reopen && session.status === 'complete';
    const [row] = await tx
        .update(linearAgentSessionsTable)
        .set({
            agentId: input.agentId,
            anchorChatId: input.anchorChatId,
            lastEventAt: input.now,
            ...(reopen ? { closedAt: null, status: 'active' as const } : {}),
        })
        .where(eq(linearAgentSessionsTable.id, session.id))
        .returning();
    if (session.agentId && session.agentId !== input.agentId) {
        await retireLinearSessionItems(tx, {
            agentId: session.agentId,
            serverId: session.serverId,
            sessionIds: [session.id],
        });
    }
    return row ?? session;
}

/**
 * Closes open sessions matching `where` and retires their unserved rows.
 * `complete` keeps its rows' history but nothing queued for it stays useful.
 */
export async function closeLinearSessions(
    tx: HausDatabase,
    input: {
        now: Date;
        serverId: string;
        status: LinearSessionClosure;
        where: {
            agentId?: string;
            exceptAgentId?: string;
            identityId?: string;
            issueId?: string;
            sessionIds?: readonly string[];
            workspaceId?: string;
        };
    }
): Promise<string[]> {
    const { where } = input;
    const closed = await tx
        .update(linearAgentSessionsTable)
        .set({ closedAt: input.now, status: input.status })
        .where(
            and(
                eq(linearAgentSessionsTable.serverId, input.serverId),
                inArray(linearAgentSessionsTable.status, openStatuses),
                where.agentId ? eq(linearAgentSessionsTable.agentId, where.agentId) : undefined,
                where.exceptAgentId
                    ? ne(linearAgentSessionsTable.agentId, where.exceptAgentId)
                    : undefined,
                where.identityId
                    ? eq(linearAgentSessionsTable.identityId, where.identityId)
                    : undefined,
                where.issueId ? eq(linearAgentSessionsTable.issueId, where.issueId) : undefined,
                where.sessionIds
                    ? inArray(linearAgentSessionsTable.id, [...where.sessionIds])
                    : undefined,
                where.workspaceId
                    ? eq(linearAgentSessionsTable.workspaceId, where.workspaceId)
                    : undefined
            )
        )
        .returning({ id: linearAgentSessionsTable.id });
    const ids = closed.map((row) => row.id);
    await retireLinearSessionItems(tx, { serverId: input.serverId, sessionIds: ids });
    return ids;
}

/**
 * Lifecycle entry points for the binding slice: an Agent losing the grant or
 * retiring, or an identity leaving `active`, orphans its open sessions.
 */
export async function orphanLinearSessions(
    tx: HausDatabase,
    input: {
        agentId?: string;
        identityId?: string;
        now: Date;
        serverId: string;
        workspaceId?: string;
    }
): Promise<string[]> {
    return await closeLinearSessions(tx, {
        now: input.now,
        serverId: input.serverId,
        status: 'orphaned',
        where: {
            agentId: input.agentId,
            identityId: input.identityId,
            workspaceId: input.workspaceId,
        },
    });
}

/** The Agent posted a `response`: the session is `complete` until a new prompt. */
export async function completeLinearSession(
    tx: HausDatabase,
    input: { now: Date; serverId: string; sessionId: string }
): Promise<void> {
    await tx
        .update(linearAgentSessionsTable)
        .set({ closedAt: input.now, status: 'complete' })
        .where(
            and(
                eq(linearAgentSessionsTable.serverId, input.serverId),
                eq(linearAgentSessionsTable.id, input.sessionId),
                eq(linearAgentSessionsTable.status, 'active')
            )
        );
    await retireLinearSessionItems(tx, {
        serverId: input.serverId,
        sessionIds: [input.sessionId],
    });
}
