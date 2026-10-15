import type { Trigger, TriggerFire, TriggerFireDetail } from '@haus/api';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    githubInstallationsTable,
    githubTriggerConfigsTable,
    linearTriggerConfigsTable,
    linearWorkspacesTable,
    serverMembershipsTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';
import { requireActiveAgent, requireAgentAnchor } from '../reminders/reminder-model.ts';
import { TriggerNotFoundError, toTrigger } from './trigger-model.ts';

type TriggerReader = Pick<HausDatabase, 'select'>;

/** Every trigger the calling Agent owns, oldest first. */
export async function listOwnedTriggers(
    db: TriggerReader,
    input: { agentId: string; origin: string; serverId: string }
): Promise<Trigger[]> {
    await requireActiveAgent(db, input.serverId, input.agentId);
    const rows = await triggerRows(db)
        .where(
            and(
                eq(triggersTable.serverId, input.serverId),
                eq(triggersTable.ownerAgentId, input.agentId),
                isNull(triggersTable.deletedAt)
            )
        )
        .orderBy(asc(triggersTable.createdAt), asc(triggersTable.id));
    return rows.map((row) => viewTrigger(row, input.origin));
}

/**
 * One trigger, refused unless the calling Agent owns it and can still reach the
 * Chat it is anchored to.
 */
export async function readOwnedTrigger(
    db: TriggerReader,
    input: { agentId: string; origin: string; serverId: string; triggerId: string }
): Promise<Trigger> {
    await requireActiveAgent(db, input.serverId, input.agentId);
    const [row] = await triggerRows(db)
        .where(
            and(
                eq(triggersTable.serverId, input.serverId),
                eq(triggersTable.id, input.triggerId),
                eq(triggersTable.ownerAgentId, input.agentId),
                isNull(triggersTable.deletedAt)
            )
        )
        .limit(1);
    if (!row) {
        throw new TriggerNotFoundError();
    }
    await requireAgentAnchor(db, {
        agentId: input.agentId,
        anchorChatId: row.trigger.anchorChatId,
        anchorMessageId: row.trigger.anchorMessageId,
        serverId: input.serverId,
    });
    return viewTrigger(row, input.origin);
}

/** Reads one trigger with no ownership check; callers own authorization. */
export async function readTrigger(
    db: TriggerReader,
    input: { origin: string; serverId: string; triggerId: string }
): Promise<Trigger> {
    const [row] = await triggerRows(db)
        .where(
            and(
                eq(triggersTable.serverId, input.serverId),
                eq(triggersTable.id, input.triggerId),
                isNull(triggersTable.deletedAt)
            )
        )
        .limit(1);
    if (!row) {
        throw new TriggerNotFoundError('That trigger does not exist in this Server.');
    }
    return viewTrigger(row, input.origin);
}

/** Fire history without payloads, newest first. */
export async function listTriggerFires(
    db: TriggerReader,
    input: { limit?: number; serverId: string; triggerId: string }
): Promise<TriggerFire[]> {
    const rows = await db
        .select()
        .from(triggerFiresTable)
        .where(
            and(
                eq(triggerFiresTable.serverId, input.serverId),
                eq(triggerFiresTable.triggerId, input.triggerId)
            )
        )
        .orderBy(desc(triggerFiresTable.receivedAt), desc(triggerFiresTable.id))
        .limit(input.limit ?? 50);
    return rows.map(toTriggerFire);
}

/** One fire with the payload the Server stored verbatim. */
export async function readTriggerFire(
    db: TriggerReader,
    input: { fireId: string; serverId: string; triggerId: string }
): Promise<TriggerFireDetail> {
    const [row] = await db
        .select()
        .from(triggerFiresTable)
        .where(
            and(
                eq(triggerFiresTable.serverId, input.serverId),
                eq(triggerFiresTable.triggerId, input.triggerId),
                eq(triggerFiresTable.id, input.fireId)
            )
        )
        .limit(1);
    if (!row) {
        throw new TriggerNotFoundError('That trigger fire does not exist.');
    }
    return { ...toTriggerFire(row), payload: row.payload };
}

function toTriggerFire(fire: typeof triggerFiresTable.$inferSelect): TriggerFire {
    return {
        contentType: fire.contentType,
        dedupeKey: fire.dedupeKey,
        id: fire.id,
        payloadBytes: fire.payloadBytes,
        receivedAt: fire.receivedAt.toISOString(),
        triggerId: fire.triggerId,
    };
}

export interface TriggerRow {
    creatorHandle: string | null;
    githubConfig: typeof githubTriggerConfigsTable.$inferSelect | null;
    githubInstallationLogin: string | null;
    linearConfig: typeof linearTriggerConfigsTable.$inferSelect | null;
    linearWorkspace: { connectionId: string | null; name: string } | null;
    ownerHandle: string;
    trigger: typeof triggersTable.$inferSelect;
}

export function viewTrigger(row: TriggerRow, origin: string): Trigger {
    return toTrigger(row.trigger, {
        createdByHandle: row.creatorHandle,
        github:
            row.githubConfig && row.githubInstallationLogin
                ? { config: row.githubConfig, installationLogin: row.githubInstallationLogin }
                : null,
        linear:
            row.linearConfig && row.linearWorkspace
                ? { config: row.linearConfig, workspace: row.linearWorkspace }
                : null,
        origin,
        ownerHandle: row.ownerHandle,
    });
}

/**
 * One trigger with what a reader needs beside the row: the Agent that owns it,
 * the Server handle of the human who created it, and, for a `github` Trigger,
 * its configuration and installation (for `linear`, its workspace). The
 * creator join is a left join because an Agent-created trigger has no
 * creator, and a human keeps the trigger even after their handle or membership
 * is gone. The kind joins are left joins because only one kind matches.
 */
export function triggerRows(db: TriggerReader) {
    return db
        .select({
            creatorHandle: serverMembershipsTable.handle,
            githubConfig: githubTriggerConfigsTable,
            githubInstallationLogin: githubInstallationsTable.accountLogin,
            linearConfig: linearTriggerConfigsTable,
            linearWorkspace: {
                connectionId: linearWorkspacesTable.connectionId,
                name: linearWorkspacesTable.name,
            },
            ownerHandle: agentsTable.handle,
            trigger: triggersTable,
        })
        .from(triggersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, triggersTable.serverId),
                eq(agentsTable.id, triggersTable.ownerAgentId)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, triggersTable.serverId),
                eq(serverMembershipsTable.userId, triggersTable.createdByUserId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .leftJoin(
            githubTriggerConfigsTable,
            and(
                eq(githubTriggerConfigsTable.serverId, triggersTable.serverId),
                eq(githubTriggerConfigsTable.triggerId, triggersTable.id)
            )
        )
        .leftJoin(
            githubInstallationsTable,
            and(
                eq(githubInstallationsTable.serverId, githubTriggerConfigsTable.serverId),
                eq(githubInstallationsTable.id, githubTriggerConfigsTable.installationRowId)
            )
        )
        .leftJoin(
            linearTriggerConfigsTable,
            and(
                eq(linearTriggerConfigsTable.serverId, triggersTable.serverId),
                eq(linearTriggerConfigsTable.triggerId, triggersTable.id)
            )
        )
        .leftJoin(
            linearWorkspacesTable,
            and(
                eq(linearWorkspacesTable.serverId, linearTriggerConfigsTable.serverId),
                eq(linearWorkspacesTable.id, linearTriggerConfigsTable.workspaceId)
            )
        )
        .$dynamic();
}
