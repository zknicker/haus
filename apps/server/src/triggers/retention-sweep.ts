import { TRIGGER_HISTORY_RETENTION_DAYS } from '@haus/api';
import { and, eq, isNotNull, lt, ne, notExists } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxTable,
    githubWebhookDeliveriesTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';
import type { TriggerClock } from './trigger-model.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const retentionMs = TRIGGER_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const githubDeliveryRetentionMs = 7 * dayMs;

/**
 * Deletes expired Trigger history without deleting an Agent's unfinished work.
 * Removed Trigger rows are tombstones: the parent waits for the same window
 * after removal, while each fire expires on its own received-at clock. A
 * non-seen trigger inbox row keeps both records until the Agent settles it.
 */
export async function deleteExpiredTriggerHistory(db: HausDatabase, now: Date): Promise<string[]> {
    const expiredBefore = new Date(now.getTime() - retentionMs);
    const triggerAwake = db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .innerJoin(
            triggerFiresTable,
            and(
                eq(triggerFiresTable.serverId, agentInboxTable.serverId),
                eq(triggerFiresTable.id, agentInboxTable.dedupeKey),
                eq(triggerFiresTable.triggerId, triggersTable.id),
                eq(triggerFiresTable.serverId, triggersTable.serverId)
            )
        )
        .where(
            and(
                eq(agentInboxTable.source, 'trigger'),
                ne(agentInboxTable.state, 'seen'),
                eq(triggerFiresTable.serverId, triggersTable.serverId),
                eq(triggerFiresTable.triggerId, triggersTable.id)
            )
        );
    const deleted = await db
        .delete(triggersTable)
        .where(
            and(
                isNotNull(triggersTable.deletedAt),
                lt(triggersTable.deletedAt, expiredBefore),
                notExists(triggerAwake)
            )
        )
        .returning({ id: triggersTable.id });

    const fireAwake = db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, triggerFiresTable.serverId),
                eq(agentInboxTable.dedupeKey, triggerFiresTable.id),
                eq(agentInboxTable.source, 'trigger'),
                ne(agentInboxTable.state, 'seen')
            )
        );
    await db
        .delete(triggerFiresTable)
        .where(and(lt(triggerFiresTable.receivedAt, expiredBefore), notExists(fireAwake)));
    await deleteExpiredGithubDeliveries(db, now);
    return deleted.map((row) => row.id);
}

/**
 * GitHub delivery guids dedupe redelivery and recovery. Recovery re-reads at
 * most GitHub's three-day log, so a week of guids always covers it.
 */
export async function deleteExpiredGithubDeliveries(db: HausDatabase, now: Date): Promise<void> {
    await db
        .delete(githubWebhookDeliveriesTable)
        .where(
            lt(
                githubWebhookDeliveriesTable.receivedAt,
                new Date(now.getTime() - githubDeliveryRetentionMs)
            )
        );
}

/** Runs retention on boot and hourly after that. */
export function startTriggerRetentionSweep(
    db: HausDatabase,
    clock: TriggerClock,
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'trigger history retention sweep',
        run: () => deleteExpiredTriggerHistory(db, clock.now()),
        timers,
    });
}
