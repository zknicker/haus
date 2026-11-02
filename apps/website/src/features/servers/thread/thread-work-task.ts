import type { ChatMessage, MessageTask } from '@haus/api';

export interface ThreadWorkTask {
    messageId: string;
    task: MessageTask;
}

/**
 * The Task a Thread surface states in its header and metadata panel: the one
 * on a message inside the Thread when it was opened on that task, else the
 * anchor's own. Either way that message's chip hides, since the panel says it.
 */
export function threadWorkTask(
    anchor: Pick<ChatMessage, 'id' | 'task'>,
    taskMessage: Pick<ChatMessage, 'id' | 'task'> | null | undefined
): ThreadWorkTask | null {
    if (taskMessage?.task) {
        return { messageId: taskMessage.id, task: taskMessage.task };
    }
    return anchor.task ? { messageId: anchor.id, task: anchor.task } : null;
}
