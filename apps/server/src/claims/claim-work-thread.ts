import { anchorMessageIdForThreadChatId, threadChatIdForAnchor } from '../threads/thread-id.ts';

/** The claim columns that place a claim's work surface. */
export interface ClaimWorkThreadRow {
    messageId: string;
    threadChatId: string | null;
}

/**
 * The Thread a claim's work happens in: the Thread its message was posted in,
 * or for a top-level message the Thread anchored on it (which may not exist
 * yet). Threads never nest, so a Thread claim never names a Thread of its own.
 */
export function claimWorkThreadChatId(row: ClaimWorkThreadRow) {
    return row.threadChatId ?? threadChatIdForAnchor(row.messageId);
}

/** The anchor message of a claim's work Thread, which keys its Thread summary. */
export function claimWorkThreadAnchorId(row: ClaimWorkThreadRow) {
    return row.threadChatId
        ? (anchorMessageIdForThreadChatId(row.threadChatId) ?? row.messageId)
        : row.messageId;
}
