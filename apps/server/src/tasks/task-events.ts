import { taskChangedTopic } from '../realtime/topics.ts';
import { threadChatIdForAnchor } from '../threads/thread-id.ts';

/**
 * Prepares `task.changed` for a task row the caller is about to commit. The
 * App invalidates the task Message's entity and `task.list`, so the event names
 * the Chat the Message sits in: a Thread task's Thread, whose access follows
 * its parent. `threadChatId` is null or the task's own work Thread for a
 * top-level task; that Thread may not exist yet, so an event must not name it.
 */
export function prepareTaskEvent(input: {
    chatId: string;
    messageId: string;
    serverId: string;
    threadChatId: string | null;
    type: 'task.created' | 'task.updated';
}) {
    const inThread =
        input.threadChatId !== null &&
        input.threadChatId !== threadChatIdForAnchor(input.messageId);
    return taskChangedTopic.prepare({
        chatId: inThread ? (input.threadChatId as string) : input.chatId,
        kind: input.type === 'task.created' ? 'created' : 'updated',
        messageId: input.messageId,
        serverId: input.serverId,
    });
}
