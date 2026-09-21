import * as React from 'react';
import {
    MessageScrollerContent,
    MessageScrollerItem,
} from '../../components/chats/message-scroller.tsx';
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
import { TranscriptRenderRowItem } from './chat-transcript-rows.tsx';

export function ChatTranscriptPresentation({
    leadingContent,
    renderContext,
    rows,
    scrollContentRef,
}: {
    leadingContent?: React.ReactNode;
    renderContext: TranscriptRenderContextValue;
    rows: TranscriptRow[];
    scrollContentRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const entries = React.useMemo(() => buildTranscriptEntries({ rows }), [rows]);
    const rawTranscriptRows = React.useMemo(
        () => buildTranscriptRenderRows(entries, renderContext.hiddenCount),
        [entries, renderContext.hiddenCount]
    );
    const transcriptRows = useStableTranscriptRenderRows(rawTranscriptRows);

    return (
        <TranscriptRenderProvider value={renderContext}>
            <div className="relative min-h-full w-full">
                {/* Rows carry their own stock py; the stack adds no extra gap
                    so adjacent turns sit Raft-tight. */}
                <MessageScrollerContent className="w-full gap-0" ref={scrollContentRef}>
                    {leadingContent}
                    {transcriptRows.map((row) =>
                        row.kind === 'hiddenCount' && renderContext.hiddenCount === 0 ? null : (
                            <MessageScrollerItem
                                // Drop paint containment so a message's hover
                                // action island can sit on top of the row
                                // without being clipped, keeping rows tight.
                                className="![content-visibility:visible]"
                                key={row.id}
                                messageId={row.id}
                            >
                                <TranscriptRenderRowItem row={row} />
                            </MessageScrollerItem>
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
