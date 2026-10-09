import { taskChangedTopic } from '../realtime/topics.ts';

/**
 * Prepares `task.changed` for a task row the caller is about to commit. The
 * App invalidates the task Message's entity and `task.list`.
 */
export function prepareTaskEvent(input: {
    chatId: string;
    messageId: string;
    serverId: string;
    type: 'task.created' | 'task.updated';
}) {
    return taskChangedTopic.prepare({
        chatId: input.chatId,
        kind: input.type === 'task.created' ? 'created' : 'updated',
        messageId: input.messageId,
        serverId: input.serverId,
    });
}
