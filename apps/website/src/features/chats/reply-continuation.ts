import type { TranscriptEntry, TranscriptItem, TranscriptRow } from './chat-transcript-model.ts';

type MessageRow = Extract<TranscriptRow, { kind: 'message' }>;

const continuationMaxGapMs = 5 * 60 * 1000;

/**
 * Collapses an inline reply that continues its author's previous reply into
 * that message's group: same author, same parent, nothing in between, within
 * the grouping window and on the same day. The follow-up drops its avatar,
 * name, and quote line, so the quote shows once, on the group's header.
 * Each message keeps its own entry, hover, and actions. Display only — the
 * reply link, routing, and jump-to-parent are unchanged.
 *
 * Anything that would leave the follow-up reading as part of something else
 * breaks the group and the follow-up shows its own header and quote: another
 * entry in between (system entries included), or a Thread or task on the
 * previous message (its block sits between the two). A cause line on the
 * follow-up also keeps its header; the turn view decides that, since a
 * skeleton row does not carry the cause.
 */
export function markReplyContinuations(entries: TranscriptEntry[]) {
    let previousMessage: MessageRow | null = null;

    for (const entry of entries) {
        if (entry.kind !== 'turn') {
            previousMessage = null;
            continue;
        }

        const message = findMessageRow(entry.items);
        entry.continuesPrevious = Boolean(
            message && previousMessage && continuesReply(previousMessage, message)
        );
        previousMessage = findMessageRow([...entry.items].reverse());
    }

    return entries;
}

function continuesReply(previous: MessageRow, next: MessageRow) {
    const previousReply = previous.message.reply;
    const nextReply = next.message.reply;

    return Boolean(
        previousReply &&
            nextReply &&
            previousReply.parentMessageId === nextReply.parentMessageId &&
            previous.actor &&
            next.actor &&
            previous.actor.kind === next.actor.kind &&
            previous.actor.id === next.actor.id &&
            !hasAttachedWork(previous) &&
            withinGroupingWindow(previous.message.timestamp, next.message.timestamp)
    );
}

// A skeleton row only knows whether its entity carries a task or a Thread.
function hasAttachedWork(row: MessageRow) {
    return Boolean(row.entity?.attachedWork || row.thread || row.message.task);
}

function withinGroupingWindow(previous: string, next: string) {
    const previousTime = Date.parse(previous);
    const nextTime = Date.parse(next);

    if (Number.isNaN(previousTime) || Number.isNaN(nextTime)) {
        return false;
    }

    return (
        nextTime - previousTime <= continuationMaxGapMs &&
        new Date(previousTime).toDateString() === new Date(nextTime).toDateString()
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
