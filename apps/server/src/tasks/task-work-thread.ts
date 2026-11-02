import { anchorMessageIdForThreadChatId, threadChatIdForAnchor } from '../threads/thread-id.ts';

/** The task columns that place a task's work surface. */
export interface TaskWorkThreadRow {
    messageId: string;
    threadChatId: string | null;
}

/**
 * The Thread a task's work happens in: the Thread its message was posted in,
 * or for a top-level message the Thread anchored on it (which may not exist
 * yet). Threads never nest, so a Thread task never names a Thread of its own.
 */
export function taskWorkThreadChatId(row: TaskWorkThreadRow) {
    return row.threadChatId ?? threadChatIdForAnchor(row.messageId);
}

/** The anchor message of a task's work Thread, which keys its Thread summary. */
export function taskWorkThreadAnchorId(row: TaskWorkThreadRow) {
    return row.threadChatId
        ? (anchorMessageIdForThreadChatId(row.threadChatId) ?? row.messageId)
        : row.messageId;
}
