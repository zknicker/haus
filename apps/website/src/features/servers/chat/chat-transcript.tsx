import * as React from 'react';
import { useMessageScrollerVisibility } from '../../../components/chats/message-scroller.tsx';
import {
    getHighestVisibleSequence,
    getTranscriptEntrySequences,
} from '../../chats/chat-read-visibility.ts';
import { ChatTranscriptPresentation } from '../../chats/chat-transcript.tsx';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { ChatSendScroll } from './chat-send-scroll.tsx';
import type { ChatTranscriptInput } from './chat-transcript-input.ts';
import { useChatTranscript } from './use-chat-transcript.tsx';

export { useChatTranscript } from './use-chat-transcript.tsx';

export function ChatTranscript({
    onVisibleSequenceChange,
    scrollContentRef,
    ...input
}: ChatTranscriptInput & {
    onVisibleSequenceChange?: (sequence: number | undefined) => void;
    scrollContentRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const { downloadError, renderContext, rows } = useChatTranscript(input);
    const transcriptEntries = React.useMemo(() => buildTranscriptEntries({ rows }), [rows]);
    const sequenceByEntryId = React.useMemo(
        () => getTranscriptEntrySequences(transcriptEntries, input.messages ?? []),
        [input.messages, transcriptEntries]
    );

    if (!input.messages) {
        return null;
    }

    return (
        <>
            {onVisibleSequenceChange ? (
                <VisibleSequenceReporter
                    onChange={onVisibleSequenceChange}
                    sequenceByEntryId={sequenceByEntryId}
                />
            ) : null}
            <ChatTranscriptPresentation
                leadingContent={
                    downloadError ? (
                        <p className="px-2 text-danger text-sm">{downloadError}</p>
                    ) : undefined
                }
                renderContext={renderContext}
                rows={rows}
                scrollContentRef={scrollContentRef}
            />
            <ChatSendScroll messages={input.pendingMessages} />
        </>
    );
}

/**
 * Reports the highest visible sequence. Its own component, so the scroller's
 * visibility store (which changes as rows scroll in and out, and resets while
 * a kept chat view is hidden) re-renders only this, never the transcript rows.
 */
function VisibleSequenceReporter({
    onChange,
    sequenceByEntryId,
}: {
    onChange: (sequence: number | undefined) => void;
    sequenceByEntryId: ReturnType<typeof getTranscriptEntrySequences>;
}) {
    const visibility = useMessageScrollerVisibility();
    const visibleSequence = getHighestVisibleSequence(
        visibility.visibleMessageIds,
        sequenceByEntryId
    );
    React.useEffect(() => {
        onChange(visibleSequence);
    }, [onChange, visibleSequence]);
    return null;
}
