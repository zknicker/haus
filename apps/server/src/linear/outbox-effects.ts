import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type LinearOutboxKind,
    linearAgentLabelsTable,
    linearAgentSessionsTable,
    linearCredentialsTable,
    linearLabelGroupsTable,
} from '../postgres/schema.ts';
import { enqueueLinearOutbox, type LinearOutboxInput } from './outbox.ts';

// The Haus side of outbox rows: what a row needs read before its call, the
// local half of a call that landed, and the check that keeps a retried
// `session_create` from opening a second session.

export interface ClaimedOutboxRow {
    attempts: number;
    client_id: string | null;
    created_at: Date;
    credential_id: string | null;
    id: string;
    input: Record<string, unknown>;
    kind: LinearOutboxKind;
    /** The lease this run holds; every write back is conditional on it. */
    next_attempt_at: Date;
    server_id: string;
    workspace_id: string;
}

/**
 * A `session_create` already took effect when the session it opened has
 * arrived: an open session on the issue, for the same actor, with an event
 * since the row was enqueued. Then a retry must not open another.
 */
export async function sessionCreateLanded(
    db: HausDatabase,
    row: ClaimedOutboxRow
): Promise<boolean> {
    if (row.kind !== 'session_create') {
        return false;
    }
    const input = row.input as LinearOutboxInput<'session_create'>;
    const [credential] = row.credential_id
        ? await db
              .select({ identityId: linearCredentialsTable.identityId })
              .from(linearCredentialsTable)
              .where(eq(linearCredentialsTable.id, row.credential_id))
              .limit(1)
        : [];
    const identityId = credential?.identityId ?? null;
    const [session] = await db
        .select({ id: linearAgentSessionsTable.id })
        .from(linearAgentSessionsTable)
        .where(
            and(
                eq(linearAgentSessionsTable.workspaceId, row.workspace_id),
                eq(linearAgentSessionsTable.issueId, input.issueId),
                identityId === null
                    ? isNull(linearAgentSessionsTable.identityId)
                    : eq(linearAgentSessionsTable.identityId, identityId),
                inArray(linearAgentSessionsTable.status, ['active', 'complete']),
                gte(linearAgentSessionsTable.lastEventAt, row.created_at)
            )
        )
        .limit(1);
    return session !== undefined;
}

export async function readGroupLabelId(
    db: HausDatabase,
    workspaceId: string,
    teamId: string
): Promise<string | null> {
    const [group] = await db
        .select({ id: linearLabelGroupsTable.groupLabelId })
        .from(linearLabelGroupsTable)
        .where(
            and(
                eq(linearLabelGroupsTable.workspaceId, workspaceId),
                eq(linearLabelGroupsTable.teamId, teamId)
            )
        )
        .limit(1);
    return group?.id ?? null;
}

/** The local half of a call that landed. */
export async function applyOutboxSuccess(tx: HausDatabase, row: ClaimedOutboxRow, now: Date) {
    if (row.kind === 'session_ack') {
        const input = row.input as LinearOutboxInput<'session_ack'>;
        await tx
            .update(linearAgentSessionsTable)
            .set({ ackedAt: now })
            .where(eq(linearAgentSessionsTable.id, input.sessionRowId));
        return;
    }
    if (row.kind === 'label_group_create' && row.client_id) {
        const input = row.input as LinearOutboxInput<'label_group_create'>;
        await tx
            .insert(linearLabelGroupsTable)
            .values({
                groupLabelId: row.client_id,
                serverId: row.server_id,
                teamId: input.teamId,
                workspaceId: row.workspace_id,
            })
            .onConflictDoNothing();
        // Labels waiting on this group may run now instead of at their backoff.
        await tx.execute(sql`
            update linear_outbox set next_attempt_at = ${now.toISOString()}::timestamptz
            where workspace_id = ${row.workspace_id} and state = 'queued'
              and kind = 'label_create' and input->>'teamId' = ${input.teamId}
        `);
        return;
    }
    if (row.kind === 'label_create' && row.client_id) {
        const input = row.input as LinearOutboxInput<'label_create'>;
        const activated = await tx
            .update(linearAgentLabelsTable)
            .set({ labelId: row.client_id, state: 'active', updatedAt: now })
            .where(
                and(
                    eq(linearAgentLabelsTable.id, input.agentLabelRowId),
                    eq(linearAgentLabelsTable.state, 'pending')
                )
            )
            .returning({ id: linearAgentLabelsTable.id });
        if (activated.length > 0) {
            return;
        }
        // The grant went away while the label was being created: archive what landed.
        await tx
            .update(linearAgentLabelsTable)
            .set({ labelId: row.client_id, updatedAt: now })
            .where(eq(linearAgentLabelsTable.id, input.agentLabelRowId));
        await enqueueLinearOutbox(
            tx,
            {
                credentialId: row.credential_id,
                input: { labelId: row.client_id },
                kind: 'label_archive',
                serverId: row.server_id,
                workspaceId: row.workspace_id,
            },
            now
        );
    }
}
