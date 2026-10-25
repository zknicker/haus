import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { reminderAgentAttentionTable, remindersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { prepareReminderEvent } from './reminder-events.ts';
import {
    ReminderAgentInactiveError,
    ReminderAnchorAccessError,
    requireActiveAgent,
    requireAgentAnchor,
} from './reminder-model.ts';
import { retireQueuedReminderFires } from './retire-fires.ts';

export async function cancelIfUnauthorized(
    db: HausDatabase,
    reminder: typeof remindersTable.$inferSelect,
    now: Date
): Promise<PreparedRealtimeEvent | null> {
    try {
        await requireActiveAgent(db, reminder.serverId, reminder.ownerAgentId);
        await requireAgentAnchor(db, {
            agentId: reminder.ownerAgentId,
            anchorChatId: reminder.anchorChatId,
            anchorMessageId: reminder.anchorMessageId,
            serverId: reminder.serverId,
        });
        return null;
    } catch (cause) {
        if (
            cause instanceof ReminderAgentInactiveError ||
            cause instanceof ReminderAnchorAccessError
        ) {
            return await cancelUnauthorizedReminder(db, reminder, now);
        }
        throw cause;
    }
}

export function writableReminderAnchor() {
    return sql`exists (
        select 1 from chats anchor
        where anchor.server_id = ${remindersTable.serverId}
            and anchor.id = ${remindersTable.anchorChatId}
            and anchor.archived_at is null
            and anchor.deleted_at is null
            and (
                anchor.kind <> 'thread'
                or exists (
                    select 1 from chats parent
                    where parent.server_id = anchor.server_id
                        and parent.id = anchor.parent_chat_id
                        and parent.archived_at is null
                        and parent.deleted_at is null
                )
            )
    )`;
}

async function cancelUnauthorizedReminder(
    db: HausDatabase,
    reminder: typeof remindersTable.$inferSelect,
    now: Date
) {
    await db
        .update(remindersTable)
        .set({
            status: 'canceled',
            updatedAt: now,
            version: reminder.version + 1,
        })
        .where(
            and(eq(remindersTable.serverId, reminder.serverId), eq(remindersTable.id, reminder.id))
        );
    await db
        .delete(reminderAgentAttentionTable)
        .where(
            and(
                eq(reminderAgentAttentionTable.serverId, reminder.serverId),
                eq(reminderAgentAttentionTable.reminderId, reminder.id)
            )
        );
    await retireQueuedReminderFires(db, reminder.serverId, reminder.id);
    return prepareReminderEvent({
        action: 'canceled',
        ownerAgentId: reminder.ownerAgentId,
        reminderId: reminder.id,
        serverId: reminder.serverId,
    });
}
