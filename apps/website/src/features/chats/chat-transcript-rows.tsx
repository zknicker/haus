import * as React from 'react';
import { DayDivider } from '../../components/chats/day-divider.tsx';
import { SessionLogHiddenCount } from '../sessions/session-log-hidden-count.tsx';
import { useTranscriptRenderContext } from './chat-transcript-render-context.tsx';
import {
    findTranscriptRenderRowActiveReply,
    type TranscriptRenderRow,
} from './chat-transcript-row-model.ts';
import { TranscriptEntryView } from './chat-transcript-turn.tsx';
import type { TranscriptActiveReply } from './transcript-contract.ts';
import { areTranscriptRenderRowsEqual } from './transcript-render-row-equality.ts';
import { useEntityTranscriptEntry } from './use-entity-transcript-entry.ts';

interface TranscriptRenderRowProps {
    activeReplies?: readonly TranscriptActiveReply[];
    row: TranscriptRenderRow;
}

interface TranscriptRenderRowViewProps {
    activeReply: TranscriptActiveReply | null;
    row: TranscriptRenderRow;
}

/**
 * A skeleton render row becomes a rendered one here: the entry reads its own
 * message entities (`useEntityTranscriptEntry`), so an entity change
 * re-renders this row and no other.
 */
export function TranscriptRenderRowItem({ activeReplies = [], row }: TranscriptRenderRowProps) {
    const entry = useEntityTranscriptEntry(row.kind === 'entry' ? row.entry : null);
    const rendered = React.useMemo(
        () => (row.kind !== 'entry' || entry === row.entry || !entry ? row : { ...row, entry }),
        [entry, row]
    );
    if (row.kind === 'entry' && !entry) {
        return null;
    }
    return (
        <TranscriptRenderRowView
            activeReply={findTranscriptRenderRowActiveReply(row, activeReplies)}
            row={rendered}
        />
    );
}

// Compared structurally (`areTranscriptRenderRowsEqual`) so historical rows
// skip re-rendering while text streams into the live turn.
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
    return (
        previous.activeReply === next.activeReply &&
        areTranscriptRenderRowsEqual(previous.row, next.row)
    );
}
