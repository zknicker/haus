import * as React from 'react';
import { MessageScrollerContent } from '../../components/chats/message-scroller.tsx';
import { buildTranscriptEntries, type TranscriptRow } from './chat-transcript-model.ts';
import {
    type TranscriptRenderContextValue,
    TranscriptRenderProvider,
} from './chat-transcript-render-context.tsx';
import {
    buildTranscriptRenderRows,
    computeStableTranscriptRenderRows,
    type StableTranscriptRenderRowsState,
} from './chat-transcript-row-model.ts';
import { TranscriptRowSlot } from './chat-transcript-row-slot.tsx';
import {
    type TranscriptRenderWindowHandle,
    useTranscriptRenderWindow,
} from './use-transcript-render-window.ts';

export function ChatTranscriptPresentation({
    leadingContent,
    renderContext,
    renderWindowRef,
    rows,
    scrollContentRef,
}: {
    leadingContent?: React.ReactNode;
    renderContext: TranscriptRenderContextValue;
    /** Receives the render window, for a caller that reveals a message outside it. */
    renderWindowRef?: React.RefObject<TranscriptRenderWindowHandle | null>;
    rows: TranscriptRow[];
    scrollContentRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const entries = React.useMemo(() => buildTranscriptEntries({ rows }), [rows]);
    const rawTranscriptRows = React.useMemo(
        () => buildTranscriptRenderRows(entries, renderContext.hiddenCount),
        [entries, renderContext.hiddenCount]
    );
    const transcriptRows = useStableTranscriptRenderRows(rawTranscriptRows);
    const renderWindow = useTranscriptRenderWindow(
        transcriptRows,
        renderContext.chatId,
        renderWindowRef
    );

    return (
        <TranscriptRenderProvider value={renderContext}>
            <div className="relative min-h-full w-full">
                {/* Rows carry their own stock py; the stack adds no extra gap
                    so adjacent turns sit Raft-tight. */}
                <MessageScrollerContent className="w-full gap-0" ref={scrollContentRef}>
                    {leadingContent}
                    {transcriptRows.map((row) =>
                        row.kind === 'hiddenCount' && renderContext.hiddenCount === 0 ? null : (
                            <TranscriptRowSlot key={row.id} renderWindow={renderWindow} row={row} />
                        )
                    )}
                </MessageScrollerContent>
            </div>
        </TranscriptRenderProvider>
    );
}

function useStableTranscriptRenderRows(rows: ReturnType<typeof buildTranscriptRenderRows>) {
    const stateRef = React.useRef<StableTranscriptRenderRowsState>({
        byId: new Map(),
        result: [],
    });

    return React.useMemo(() => {
        const nextState = computeStableTranscriptRenderRows(rows, stateRef.current);
        stateRef.current = nextState;
        return nextState.result;
    }, [rows]);
}
