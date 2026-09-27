import * as React from 'react';
import { DayDivider } from '../../components/chats/day-divider.tsx';
import { SessionLogHiddenCount } from '../sessions/session-log-hidden-count.tsx';
import type { TranscriptActor, TranscriptEntry, TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContext } from './chat-transcript-render-context.tsx';
import {
    findTranscriptRenderRowActiveReply,
    type TranscriptRenderRow,
} from './chat-transcript-row-model.ts';
import { TranscriptEntryView } from './chat-transcript-turn.tsx';
import type { TranscriptActiveReply } from './transcript-contract.ts';

interface TranscriptRenderRowProps {
    activeReplies?: readonly TranscriptActiveReply[];
    row: TranscriptRenderRow;
}

interface TranscriptRenderRowViewProps {
    activeReply: TranscriptActiveReply | null;
    row: TranscriptRenderRow;
}

export function TranscriptRenderRowItem({ activeReplies = [], row }: TranscriptRenderRowProps) {
    return (
        <TranscriptRenderRowView
            activeReply={findTranscriptRenderRowActiveReply(row, activeReplies)}
            row={row}
        />
    );
}

// Entry and item wrappers are rebuilt on every streaming update, but the
// underlying row objects keep their identity. Comparing structurally lets
// historical rows skip re-rendering while text streams into the live turn.
const TranscriptRenderRowView = React.memo(({ activeReply, row }: TranscriptRenderRowViewProps) => {
    const { chatId, conversationLayout, currentSessionKey, defaultOpenWorkGroups, hiddenCount } =
        useTranscriptRenderContext();

    if (row.kind === 'hiddenCount') {
        return <SessionLogHiddenCount hiddenCount={hiddenCount} />;
    }

    if (row.kind === 'dayDivider') {
        return <DayDivider className="mx-3 mt-2" label={row.label} />;
    }

    return (
        <TranscriptEntryView
            activeReply={activeReply}
            chatId={chatId}
            conversationLayout={conversationLayout}
            currentSessionKey={currentSessionKey}
            defaultOpenWorkGroups={defaultOpenWorkGroups}
            entry={row.entry}
            followsRuntimeNotice={row.followsRuntimeNotice}
            sessionNotice={row.sessionNotice}
            turnStartedAt={row.turnStartedAt}
        />
    );
}, areTranscriptRenderRowViewPropsEqual);

TranscriptRenderRowView.displayName = 'TranscriptRenderRowView';

function areTranscriptRenderRowViewPropsEqual(
    previous: TranscriptRenderRowViewProps,
    next: TranscriptRenderRowViewProps
) {
    return previous.activeReply === next.activeReply && areRenderRowsEqual(previous.row, next.row);
}

function areRenderRowsEqual(
    previous: TranscriptRenderRowViewProps['row'],
    next: TranscriptRenderRowViewProps['row']
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
