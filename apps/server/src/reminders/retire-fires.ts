import { and, eq } from 'drizzle-orm';
import { retireQueuedItemsByDedupeKeys } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { reminderFiresTable } from '../postgres/schema.ts';

/**
 * Drops the owning Agent's queued fires for a Reminder that will never fire
 * again. A fire envelope lives only in the delivery queue — no Chat message
 * backs it — so a canceled Reminder's queued fires would keep waking their
 * Agent with work it can no longer act on.
 */
export async function retireQueuedReminderFires(
    db: HausDatabase,
    serverId: string,
    reminderId: string
): Promise<void> {
    const fires = await db
        .select({ id: reminderFiresTable.id })
        .from(reminderFiresTable)
        .where(
            and(
                eq(reminderFiresTable.serverId, serverId),
                eq(reminderFiresTable.reminderId, reminderId)
            )
        );
    await retireQueuedItemsByDedupeKeys(db, {
        dedupeKeys: fires.map((fire) => fire.id),
        serverId,
    });
}
