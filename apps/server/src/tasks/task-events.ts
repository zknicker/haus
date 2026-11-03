import { taskChangedTopic } from '../realtime/topics.ts';

/**
 * Prepares `task.changed` for a task row the caller is about to commit. The
 * App invalidates the task Message's entity and `task.list`, so the event names
 * the Chat the Message sits in: a Thread task's Thread, whose access follows
 * its parent. `threadChatId` is the task row's own column, null for a
 * top-level task.
 */
export function prepareTaskEvent(input: {
    chatId: string;
    messageId: string;
    serverId: string;
    threadChatId: string | null;
    type: 'task.created' | 'task.updated';
}) {
    return taskChangedTopic.prepare({
        chatId: input.threadChatId ?? input.chatId,
        kind: input.type === 'task.created' ? 'created' : 'updated',
        messageId: input.messageId,
        serverId: input.serverId,
    });
}
