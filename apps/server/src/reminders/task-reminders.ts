import type { AgentTaskRefusalCode } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';

/**
 * A Task holds only one-time reminders (ADR 0053 decision 16). A recurring
 * reminder anchors on a Channel, and a fire that turns up real work starts a
 * Task there.
 */
export class TaskRecurringReminderError extends Error {
    readonly code: AgentTaskRefusalCode = 'TASK_RECURRING_REMINDER';

    constructor() {
        super(
            'A Task holds only one-time reminders. Anchor a recurring reminder on a Channel message instead; a fire that finds real work starts a Task there.'
        );
        this.name = 'TaskRecurringReminderError';
    }
}

/**
 * Where a reminder set on a Task anchors: the newest message in the Task's own
 * Chat, or its origin Message in the Channel above while the Task has no posts.
 * Either way `anchor_chat_id` is the Task's Chat, so the fire reports to the
 * Task and closing the Task cancels it.
 */
export async function readTaskReminderAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string }
): Promise<{ anchorChatId: string; anchorMessageId: string }> {
    const [newest] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId)
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(1);
    if (newest) {
        return { anchorChatId: input.chatId, anchorMessageId: newest.id };
    }
    const [task] = await db
        .select({ originMessageId: chatsTable.anchorMessageId })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                eq(chatsTable.kind, 'task')
            )
        )
        .limit(1);
    if (!task?.originMessageId) {
        throw new Error(`Task Chat ${input.chatId} has no origin Message.`);
    }
    return { anchorChatId: input.chatId, anchorMessageId: task.originMessageId };
}

/** Refuses `repeat` on a reminder anchored in a Task's own Chat. */
export async function refuseRecurringTaskReminder(
    db: Pick<HausDatabase, 'select'>,
    input: { anchorChatId: string; repeat: string | null | undefined; serverId: string }
): Promise<void> {
    if (!input.repeat) {
        return;
    }
    const [chat] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.anchorChatId)))
        .limit(1);
    if (chat?.kind === 'task') {
        throw new TaskRecurringReminderError();
    }
}
