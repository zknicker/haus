import { and, eq, isNull, sql } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { remindersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { prepareReminderEvent } from '../reminders/reminder-events.ts';
import { retireQueuedReminderFires } from '../reminders/retire-fires.ts';

export async function cancelTaskReminders(
    tx: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<PreparedRealtimeEvent[]> {
    const canceled = await tx
        .update(remindersTable)
        .set({
            status: 'canceled',
            updatedAt: sql`now()`,
            version: sql`${remindersTable.version} + 1`,
        })
        .where(
            and(
                eq(remindersTable.serverId, input.serverId),
                eq(remindersTable.anchorChatId, input.chatId),
                eq(remindersTable.status, 'scheduled'),
                isNull(remindersTable.repeat)
            )
        )
        .returning({ id: remindersTable.id, ownerAgentId: remindersTable.ownerAgentId });
    const events: PreparedRealtimeEvent[] = [];
    for (const reminder of canceled) {
        await retireQueuedReminderFires(tx, input.serverId, reminder.id);
        events.push(
            prepareReminderEvent({
                action: 'canceled',
                ownerAgentId: reminder.ownerAgentId,
                reminderId: reminder.id,
                serverId: input.serverId,
            })
        );
    }
    return events;
}
