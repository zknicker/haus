import type { AgentTaskRefusalCode } from '@haus/api';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import { TaskInvariantError } from '../tasks/task-errors.ts';

export class TaskRecurringReminderError extends Error {
    readonly code: AgentTaskRefusalCode = 'TASK_RECURRING_REMINDER';

    constructor() {
        super(
            'A Task holds only one-time reminders. Anchor a recurring reminder on a Channel message instead; a fire that finds real work starts a Task there.'
        );
        this.name = 'TaskRecurringReminderError';
    }
}

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
    if (!newest) {
        throw new TaskInvariantError(
            'This Task has no messages yet, and a reminder on it anchors on one of its own. Post in the Task first.'
        );
    }
    return { anchorChatId: input.chatId, anchorMessageId: newest.id };
}

/**
 * A reminder anchored in a Task's chat belongs to the Task's agent, whoever set it, so its fire
 * wakes the Task and not its Captain (specs/tasks.md#reminders-on-a-task). A Task agent sets
 * reminders only in its own chat, so anywhere else it has no owner (null).
 */
export async function readReminderOwner(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; anchorChatId: string; serverId: string }
) {
    const [anchorTask] = await db
        .select({ agentId: tasksTable.agentId })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.chatId, input.anchorChatId),
                isNotNull(tasksTable.agentId)
            )
        )
        .limit(1);
    if (anchorTask?.agentId) {
        return anchorTask.agentId;
    }
    const [setter] = await db
        .select({ kind: agentsTable.kind })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    return setter?.kind === 'task' ? null : input.agentId;
}

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
