import type { TranscriptActor, TranscriptEntry, TranscriptItem } from './chat-transcript-model.ts';
import type { TranscriptRenderRow } from './chat-transcript-row-model.ts';

/**
 * Entry and item wrappers are rebuilt on every transcript update, but the
 * underlying row objects keep their identity, so render rows compare
 * structurally: an unchanged row keeps its object (`computeStableTranscriptRenderRows`)
 * and its memoized slot and view skip re-rendering.
 */
export function areTranscriptRenderRowsEqual(
    previous: TranscriptRenderRow,
    next: TranscriptRenderRow
) {
    if (previous.kind !== next.kind || previous.id !== next.id) {
        return false;
    }

    if (previous.kind === 'hiddenCount' || next.kind === 'hiddenCount') {
        return true;
    }

    if (previous.kind === 'dayDivider' || next.kind === 'dayDivider') {
        return (
            previous.kind === 'dayDivider' &&
            next.kind === 'dayDivider' &&
            previous.label === next.label
        );
    }

    return (
        previous.followsRuntimeNotice === next.followsRuntimeNotice &&
        previous.sessionNotice === next.sessionNotice &&
        previous.turnStartedAt === next.turnStartedAt &&
        areEntriesEqual(previous.entry, next.entry)
    );
}

function areEntriesEqual(previous: TranscriptEntry, next: TranscriptEntry) {
    if (previous === next) {
        return true;
    }

    if (
        previous.kind !== next.kind ||
        previous.id !== next.id ||
        previous.timestamp !== next.timestamp
    ) {
        return false;
    }

    if (previous.kind === 'system' || next.kind === 'system') {
        return (
            previous.kind === 'system' &&
            next.kind === 'system' &&
            areItemsEqual(previous.item, next.item)
        );
    }

    return (
        previous.key === next.key &&
        previous.participant === next.participant &&
        previous.showReplyReference === next.showReplyReference &&
        areActorsEqual(previous.actor, next.actor) &&
        previous.items.length === next.items.length &&
        previous.items.every((item, index) => areItemsEqual(item, next.items[index]))
    );
}

function areItemsEqual(previous: TranscriptItem, next: TranscriptItem | undefined) {
    if (!next) {
        return false;
    }

    if (previous === next) {
        return true;
    }

    if (previous.kind !== next.kind) {
        return false;
    }

    switch (previous.kind) {
        case 'row':
            return next.kind === 'row' && previous.row === next.row;
        case 'activeReply':
            return next.kind === 'activeReply' && previous.reply === next.reply;
        case 'activeStatus':
            return (
                next.kind === 'activeStatus' &&
                previous.reply === next.reply &&
                previous.status === next.status
            );
        default:
            return false;
    }
}

function areActorsEqual(previous: TranscriptActor, next: TranscriptActor) {
    if (previous === next) {
        return true;
    }

    return Boolean(previous && next && previous.kind === next.kind && previous.id === next.id);
}
