import type { ChatMessage, MessageTask, ThreadSummary } from '@haus/api';
import { serverChatRoute, serverChatThreadRoute } from '../server-routes.ts';

/**
 * Where a task's work is read, under its parent Channel or DM (`task.chatId`).
 * A task on a top-level message opens the Thread anchored on that message. A
 * task on a message inside a Thread opens the Thread it sits in: Threads never
 * nest, so that message never anchors a Thread of its own and nothing replies
 * to it as one.
 */
export type TaskThreadTarget =
    | { anchorMessageId: string; kind: 'anchor'; threadChatId: string }
    | {
          /** The top-level message the containing Thread hangs on. */
          anchorMessageId: string;
          kind: 'in-thread';
          taskMessageId: string;
          threadChatId: string;
      };

export interface TaskThreadSource {
    message: Pick<ChatMessage, 'chatId' | 'id'>;
    task: Pick<MessageTask, 'chatId' | 'threadChatId'>;
    /** For a Thread task, the summary of the Thread the message sits in. */
    threadSummary: Pick<ThreadSummary, 'anchorMessageId'>;
}

/**
 * The task's Thread, or null when a Thread task arrives without the anchor of
 * the Thread it sits in: opening the task message as an anchor would nest.
 */
export function taskThreadTarget({
    message,
    task,
    threadSummary,
}: TaskThreadSource): TaskThreadTarget | null {
    if (!isThreadTask({ message, task })) {
        return { anchorMessageId: message.id, kind: 'anchor', threadChatId: task.threadChatId };
    }
    if (threadSummary.anchorMessageId === message.id) {
        return null;
    }
    return {
        anchorMessageId: threadSummary.anchorMessageId,
        kind: 'in-thread',
        taskMessageId: message.id,
        threadChatId: task.threadChatId,
    };
}

/**
 * "View in chat": the task's Channel or DM, opened on the Thread a Thread
 * task sits in. A top-level task's message is in the chat itself.
 */
export function taskChatRoute(
    slug: string,
    task: Pick<TaskThreadSource['task'], 'chatId' | 'threadChatId'> & {
        message: TaskThreadSource['message'];
        threadSummary: TaskThreadSource['threadSummary'];
    }
): string {
    const target = taskThreadTarget({
        message: task.message,
        task,
        threadSummary: task.threadSummary,
    });
    return target?.kind === 'in-thread'
        ? serverChatThreadRoute(slug, task.chatId, target.anchorMessageId)
        : serverChatRoute(slug, task.chatId);
}

/** A Thread task's message lives in the Thread, not in the task's Channel or DM. */
export function isThreadTask({
    message,
    task,
}: Pick<TaskThreadSource, 'message' | 'task'>): boolean {
    return message.chatId !== task.chatId;
}
