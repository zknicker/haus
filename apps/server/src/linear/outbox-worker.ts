import { type EffectRuntime, settle } from '@haus/effect';
import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearOutboxTable } from '../postgres/schema.ts';
import { type LinearOutboxInput, linearOutboxInputSchemas } from './outbox.ts';
import { type LinearOutboxTransport, runLinearOutboxCall } from './outbox-calls.ts';
import {
    applyOutboxSuccess,
    type ClaimedOutboxRow,
    readGroupLabelId,
    sessionCreateLanded,
} from './outbox-effects.ts';

/** After this many failed attempts a row is `dead` and never retried automatically. */
export const linearOutboxMaxAttempts = 8;
const firstBackoffMs = 2000;
const maxBackoffMs = 60 * 60 * 1000;
/** A claimed row is leased this long; a crash mid-call lets it run again after. */
const callLeaseMs = 60_000;
/** A hand-back lists and re-delegates every open issue; it holds a longer lease. */
const handBackLeaseMs = 15 * 60_000;
const batchSize = 20;

/**
 * Two lanes, each with its own poller: `calls` runs every short call
 * (`session_ack` first), and `hand_back` runs `identity_hand_back`, which can
 * take minutes, so it never holds an acknowledgment back.
 */
export type LinearOutboxLane = 'calls' | 'hand_back';

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
    lane: LinearOutboxLane;
    runtime: EffectRuntime<never>;
    transport: LinearOutboxTransport;
}

/**
 * Runs up to one batch of due rows in a lane, claiming one row at a time so a
 * row's lease starts when its call does. Each call's success and its local
 * effects (a session marked acknowledged, a label row activated) commit
 * together, and only while this run still holds the row's lease; a failure
 * backs off from 2 seconds to an hour.
 */
export async function runLinearOutboxBatch(
    dependencies: LinearOutboxWorkerDependencies
): Promise<{ more: boolean }> {
    for (let ran = 0; ran < batchSize; ran += 1) {
        const row = await claimRow(dependencies);
        if (!row) {
            return { more: false };
        }
        await runRow(dependencies, row);
    }
    return { more: true };
}

async function claimRow(
    dependencies: LinearOutboxWorkerDependencies
): Promise<ClaimedOutboxRow | null> {
    const now = dependencies.clock.now();
    const handBack = dependencies.lane === 'hand_back';
    const lease = new Date(now.getTime() + (handBack ? handBackLeaseMs : callLeaseMs));
    const [row] = (await dependencies.db.execute(sql`
        update linear_outbox
        set next_attempt_at = ${lease.toISOString()}::timestamptz
        where id in (
            select id from linear_outbox
            where state = 'queued' and next_attempt_at <= ${now.toISOString()}::timestamptz
              and (kind = 'identity_hand_back') = ${handBack}
            order by (kind = 'session_ack') desc, next_attempt_at
            limit 1
            for update skip locked
        )
        returning id, kind, input, client_id, credential_id, attempts, server_id,
            workspace_id, created_at, next_attempt_at
    `)) as unknown as (Omit<ClaimedOutboxRow, 'created_at' | 'next_attempt_at'> & {
        created_at: Date | string;
        next_attempt_at: Date | string;
    })[];
    return row
        ? {
              ...row,
              created_at: new Date(row.created_at),
              next_attempt_at: new Date(row.next_attempt_at),
          }
        : null;
}

async function runRow(dependencies: LinearOutboxWorkerDependencies, row: ClaimedOutboxRow) {
    const { db } = dependencies;
    try {
        const input = linearOutboxInputSchemas[row.kind].parse(row.input);
        if (!(await sessionCreateLanded(db, row))) {
            await runLinearOutboxCall(dependencies.transport, {
                accessToken: row.credential_id
                    ? await dependencies.credentials.accessToken(row.credential_id)
                    : null,
                clientId: row.client_id,
                groupLabelId:
                    row.kind === 'label_create'
                        ? await readGroupLabelId(
                              db,
                              row.workspace_id,
                              (input as LinearOutboxInput<'label_create'>).teamId
                          )
                        : null,
                input,
                kind: row.kind,
            });
        }
        const now = dependencies.clock.now();
        await db.transaction(async (tx) => {
            const finished = await tx
                .update(linearOutboxTable)
                .set({ doneAt: now, lastError: null, state: 'done' })
                .where(leaseHeld(row))
                .returning({ id: linearOutboxTable.id });
            // A run that outlived its lease leaves the row to whoever holds it now.
            if (finished.length > 0) {
                await applyOutboxSuccess(tx, row, now);
            }
        });
    } catch (error) {
        await recordFailure(dependencies, row, error);
    }
}

/** The row is still queued under the lease this run claimed. */
function leaseHeld(row: ClaimedOutboxRow) {
    return and(
        eq(linearOutboxTable.id, row.id),
        eq(linearOutboxTable.state, 'queued'),
        eq(linearOutboxTable.attempts, row.attempts),
        eq(linearOutboxTable.nextAttemptAt, row.next_attempt_at)
    );
}

async function recordFailure(
    dependencies: LinearOutboxWorkerDependencies,
    row: ClaimedOutboxRow,
    error: unknown
) {
    const attempts = row.attempts + 1;
    const now = dependencies.clock.now();
    const dead = attempts >= linearOutboxMaxAttempts;
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    const recorded = await dependencies.db
        .update(linearOutboxTable)
        .set({
            attempts,
            doneAt: dead ? now : null,
            lastError: describe(error),
            nextAttemptAt: new Date(now.getTime() + backoff),
            state: dead ? 'dead' : 'queued',
        })
        .where(leaseHeld(row))
        .returning({ id: linearOutboxTable.id });
    if (dead && recorded.length > 0) {
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

/** Stored for the operator; never a token (calls never echo credentials). */
function describe(error: unknown): string {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    return message.slice(0, 500);
}
