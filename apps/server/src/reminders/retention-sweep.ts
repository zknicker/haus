import { REMINDER_HISTORY_RETENTION_DAYS } from '@haus/api';
import { and, eq, inArray, lt, notExists } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    reminderAgentAttentionTable,
    reminderFiresTable,
    remindersTable,
    taskReminderLinksTable,
} from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { prepareTaskLinkEvents } from '../tasks/task-reference-links.ts';
import type { ReminderClock } from './reminder-model.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const retentionMs = REMINDER_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Deletes expired reminder history: every fire older than the retention
 * window, and every reminder that settled before it.
 *
 * A fire is one history entry, so it expires on its own `fired_at` clock no
 * matter what its reminder is doing. A recurring reminder therefore keeps its
 * row and its recent fires while its old ones drop away; a one-shot's last fire
 * usually leaves with the reminder itself.
 *
 * `updated_at` is the moment a reminder settled — the fire transaction and
 * cancellation both stamp it — so it is the reminder's retention clock. Only
 * `fired` and `canceled` rows are settled. A recurring reminder stays
 * `scheduled` between fires and is never swept, however old it is; its own
 * cancellation is what starts its retention window.
 *
 * Age is not the only condition: a fire whose wake is still queued for its
 * Agent — a `reminder_agent_attention` row — is unfinished business, not
 * history, and the sweep leaves it and its reminder alone however old they are.
 * The Agent seeing the wake drops that row, and the next pass takes the fire.
 *
 * The reminder row is the parent of its whole record: `reminder_fires`,
 * `reminder_commands`, `reminder_agent_attention`, and the `reminder.changed`
 * events all cascade from it, and a fire row is the parent of the
 * `reminder_agent_attention` row that names it. Provenance is the exception:
 * `message_causes` snapshots what the mark says and outlives the reminder, so
 * sweeping history leaves the Agent's answer marked with the automation that
 * provoked it, reading archived (ADR 0026).
 */
export async function deleteExpiredReminderHistory(db: HausDatabase, now: Date): Promise<string[]> {
    const settledBefore = new Date(now.getTime() - retentionMs);
    const reminderAwake = db
        .select({ fireId: reminderAgentAttentionTable.fireId })
        .from(reminderAgentAttentionTable)
        .where(
            and(
                eq(reminderAgentAttentionTable.serverId, remindersTable.serverId),
                eq(reminderAgentAttentionTable.reminderId, remindersTable.id)
            )
        );
    const expired = and(
        inArray(remindersTable.status, ['canceled', 'fired']),
        lt(remindersTable.updatedAt, settledBefore),
        notExists(reminderAwake)
    );
    // The links cascade with the Reminders, so read them first.
    const linked = await db
        .select({
            serverId: taskReminderLinksTable.serverId,
            taskId: taskReminderLinksTable.taskId,
        })
        .from(taskReminderLinksTable)
        .innerJoin(
            remindersTable,
            and(
                eq(remindersTable.serverId, taskReminderLinksTable.serverId),
                eq(remindersTable.id, taskReminderLinksTable.reminderId)
            )
        )
        .where(expired);
    const deleted = await db
        .delete(remindersTable)
        .where(expired)
        .returning({ id: remindersTable.id });
    for (const serverId of new Set(linked.map((link) => link.serverId))) {
        const taskIds = linked.filter((link) => link.serverId === serverId).map((l) => l.taskId);
        publishRealtime(await prepareTaskLinkEvents(db, { serverId, taskIds }));
    }
    const fireAwake = db
        .select({ fireId: reminderAgentAttentionTable.fireId })
        .from(reminderAgentAttentionTable)
        .where(
            and(
                eq(reminderAgentAttentionTable.serverId, reminderFiresTable.serverId),
                eq(reminderAgentAttentionTable.fireId, reminderFiresTable.id)
            )
        );
    await db
        .delete(reminderFiresTable)
        .where(and(lt(reminderFiresTable.firedAt, settledBefore), notExists(fireAwake)));
    return deleted.map((row) => row.id);
}

/** Runs the retention delete on boot and hourly after that. */
export function startReminderRetentionSweep(
    db: HausDatabase,
    clock: ReminderClock,
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'reminder history retention sweep',
        run: () => deleteExpiredReminderHistory(db, clock.now()),
        timers,
    });
}
