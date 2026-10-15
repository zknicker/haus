import { type EffectRuntime, settle } from '@haus/effect';
import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type LinearOutboxKind,
    linearAgentLabelsTable,
    linearAgentSessionsTable,
    linearLabelGroupsTable,
    linearOutboxTable,
} from '../postgres/schema.ts';
import { enqueueLinearOutbox, type LinearOutboxInput, linearOutboxInputSchemas } from './outbox.ts';
import { type LinearOutboxTransport, runLinearOutboxCall } from './outbox-calls.ts';

/** After this many failed attempts a row is `dead` and never retried automatically. */
export const linearOutboxMaxAttempts = 8;
const firstBackoffMs = 2000;
const maxBackoffMs = 60 * 60 * 1000;
/** A claimed row is leased this long; a crash mid-call lets it run again after. */
const claimLeaseMs = 60_000;
const batchSize = 20;

/**
 * Valid access tokens by credential row, owned by the binding slice's
 * credentials module (refresh, single flight, CAS). It throws when the
 * credential is gone, `refresh_required`, or `revoked`.
 */
export interface LinearOutboxCredentials {
    accessToken(credentialId: string): Promise<string>;
}

export interface LinearOutboxWorkerDependencies {
    clock: { now(): Date };
    credentials: LinearOutboxCredentials;
    db: HausDatabase;
    runtime: EffectRuntime<never>;
    transport: LinearOutboxTransport;
}

interface ClaimedRow {
    attempts: number;
    client_id: string | null;
    credential_id: string | null;
    id: string;
    input: Record<string, unknown>;
    kind: LinearOutboxKind;
    server_id: string;
    workspace_id: string;
}

/**
 * Runs one batch of due outbox rows. `session_ack` rows go first so Linear's
 * 10-second acknowledgment holds even with every Computer offline. Each call's
 * success and its local effects (a session marked acknowledged, a label row
 * activated) commit together; a failure backs off from 2 seconds to an hour.
 */
export async function runLinearOutboxBatch(
    dependencies: LinearOutboxWorkerDependencies
): Promise<{ more: boolean }> {
    const now = dependencies.clock.now();
    const rows = (await dependencies.db.execute(sql`
        update linear_outbox
        set next_attempt_at = ${new Date(now.getTime() + claimLeaseMs).toISOString()}::timestamptz
        where id in (
            select id from linear_outbox
            where state = 'queued' and next_attempt_at <= ${now.toISOString()}::timestamptz
            order by (kind = 'session_ack') desc, next_attempt_at
            limit ${batchSize}
            for update skip locked
        )
        returning id, kind, input, client_id, credential_id, attempts, server_id, workspace_id
    `)) as unknown as ClaimedRow[];
    const ordered = [...rows].sort(
        (left, right) => Number(right.kind === 'session_ack') - Number(left.kind === 'session_ack')
    );
    for (const row of ordered) {
        await runRow(dependencies, row);
    }
    return { more: rows.length === batchSize };
}

async function runRow(dependencies: LinearOutboxWorkerDependencies, row: ClaimedRow) {
    const { db } = dependencies;
    try {
        const input = linearOutboxInputSchemas[row.kind].parse(row.input);
        const accessToken = row.credential_id
            ? await dependencies.credentials.accessToken(row.credential_id)
            : null;
        const groupLabelId =
            row.kind === 'label_create'
                ? await readGroupLabelId(
                      db,
                      row.workspace_id,
                      (input as LinearOutboxInput<'label_create'>).teamId
                  )
                : null;
        await runLinearOutboxCall(dependencies.transport, {
            accessToken,
            clientId: row.client_id,
            groupLabelId,
            input,
            kind: row.kind,
        });
        const now = dependencies.clock.now();
        await db.transaction(async (tx) => {
            await tx
                .update(linearOutboxTable)
                .set({ doneAt: now, lastError: null, state: 'done' })
                .where(eq(linearOutboxTable.id, row.id));
            await applySuccess(tx, row, now);
        });
    } catch (error) {
        await recordFailure(dependencies, row, error);
    }
}

/** The local half of a call that landed. */
async function applySuccess(tx: HausDatabase, row: ClaimedRow, now: Date) {
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

async function recordFailure(
    dependencies: LinearOutboxWorkerDependencies,
    row: ClaimedRow,
    error: unknown
) {
    const attempts = row.attempts + 1;
    const now = dependencies.clock.now();
    const dead = attempts >= linearOutboxMaxAttempts;
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    await dependencies.db
        .update(linearOutboxTable)
        .set({
            attempts,
            doneAt: dead ? now : null,
            lastError: describe(error),
            nextAttemptAt: new Date(now.getTime() + backoff),
            state: dead ? 'dead' : 'queued',
        })
        .where(eq(linearOutboxTable.id, row.id));
    if (dead) {
        await settle(
            dependencies.runtime,
            Effect.logError('linear.outbox_dead').pipe(
                Effect.annotateLogs({
                    attempts,
                    kind: row.kind,
                    operation: 'linear.outbox_dead',
                    outboxId: row.id,
                    workspaceId: row.workspace_id,
                })
            )
        );
    }
}

async function readGroupLabelId(
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

/** Stored for the operator; never a token (calls never echo credentials). */
function describe(error: unknown): string {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    return message.slice(0, 500);
}
