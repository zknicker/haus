import { and, inArray, lt, ne } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    linearAgentSessionsTable,
    linearOauthAttemptsTable,
    linearOutboxTable,
    linearWebhookDeliveriesTable,
} from '../postgres/schema.ts';
import { deleteExpiredLinearWrites } from './write-ledger.ts';

// Retention for Linear's operational records (specs/linear-app.md#data-model),
// run hourly beside the other retention sweeps whether or not the Haus
// Linear app is configured, so records outlive no configuration change.

const sweepIntervalMs = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
/** Deliveries and outbox rows 7 days, closed sessions 90 (the ledger owns its 30). */
const linearRetentionMs = {
    deliveries: 7 * dayMs,
    outbox: 7 * dayMs,
    sessions: 90 * dayMs,
} as const;

/**
 * Linear's operational records: finished deliveries (a `failed` one keeps its
 * raw body for the operator until then), settled outbox rows, the write
 * ledger, closed sessions, and expired OAuth attempts.
 */
export async function deleteExpiredLinearRecords(db: HausDatabase, now: Date): Promise<void> {
    const before = (ms: number) => new Date(now.getTime() - ms);
    await db
        .delete(linearWebhookDeliveriesTable)
        .where(
            and(
                inArray(linearWebhookDeliveriesTable.state, ['done', 'ignored', 'failed']),
                lt(linearWebhookDeliveriesTable.receivedAt, before(linearRetentionMs.deliveries))
            )
        );
    await db
        .delete(linearOutboxTable)
        .where(
            and(
                inArray(linearOutboxTable.state, ['done', 'dead']),
                lt(linearOutboxTable.doneAt, before(linearRetentionMs.outbox))
            )
        );
    await deleteExpiredLinearWrites(db, now);
    await db
        .delete(linearAgentSessionsTable)
        .where(
            and(
                ne(linearAgentSessionsTable.status, 'active'),
                lt(linearAgentSessionsTable.closedAt, before(linearRetentionMs.sessions))
            )
        );
    await db.delete(linearOauthAttemptsTable).where(lt(linearOauthAttemptsTable.expiresAt, now));
}

/** Runs Linear retention on boot and hourly after that. */
export function startLinearRetentionSweep(
    db: HausDatabase,
    clock: { now(): Date },
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'Linear retention sweep',
        run: () => deleteExpiredLinearRecords(db, clock.now()),
        timers,
    });
}
