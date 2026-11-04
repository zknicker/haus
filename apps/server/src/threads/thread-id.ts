/**
 * A Thread's id is derived from its anchor message, never stored on the anchor
 * or on the claim. Every surface that needs the id — the claim read model,
 * freshness checks, materialization — computes it from this one place, so a
 * Thread that has not been created yet still has exactly one name.
 */
export function threadChatIdForAnchor(anchorMessageId: string) {
    return `cht_thr_${anchorMessageId.startsWith('msg_') ? anchorMessageId.slice(4) : anchorMessageId}`;
}

/** The inverse: which anchor message a Thread id names. */
export function anchorMessageIdForThreadChatId(threadChatId: string) {
    return threadChatId.startsWith('cht_thr_')
        ? `msg_${threadChatId.slice('cht_thr_'.length)}`
        : null;
}
