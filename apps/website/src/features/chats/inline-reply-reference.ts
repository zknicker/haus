import type { TranscriptEntry, TranscriptItem, TranscriptRow } from './chat-transcript-model.ts';

type MessageRow = Extract<TranscriptRow, { kind: 'message' }>;

/**
 * Hides the quote header on an inline reply that continues its author's
 * previous message: same author, same parent, nothing authored in between.
 * An acknowledgment and its follow-up then read as one answer. Display only —
 * the reply link, routing, and jump-to-parent are unchanged.
 *
 * System entries are not authored messages, so they never interrupt; day
 * dividers are render rows, not entries, so they never interrupt either. A
 * reply never merges into a grouped turn, so it is always its entry's first
 * message and the comparison runs against the previous turn's last message.
 */
export function markRepeatedReplyReferences(entries: TranscriptEntry[]) {
    let previousMessage: MessageRow | null = null;

    for (const entry of entries) {
        if (entry.kind !== 'turn') {
            continue;
        }

        const message = findMessageRow(entry.items);
        entry.showReplyReference = !(
            message &&
            previousMessage &&
            continuesReplyChain(previousMessage, message)
        );
        previousMessage = findMessageRow([...entry.items].reverse());
    }

    return entries;
}

function continuesReplyChain(previous: MessageRow, next: MessageRow) {
    const previousReply = previous.message.reply;
    const nextReply = next.message.reply;

    return Boolean(
        previousReply &&
            nextReply &&
            previousReply.parentMessageId === nextReply.parentMessageId &&
            previous.actor &&
            next.actor &&
            previous.actor.kind === next.actor.kind &&
            previous.actor.id === next.actor.id
    );
}

function findMessageRow(items: readonly TranscriptItem[]): MessageRow | null {
    for (const item of items) {
        if (item.kind === 'row' && item.row.kind === 'message') {
            return item.row;
        }
    }

    return null;
}
