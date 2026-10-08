import * as React from 'react';
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerProvider,
    MessageScrollerViewport,
    useMessageScroller,
} from '../../components/chats/message-scroller.tsx';
import type { ScrollToMessage } from '../../hooks/servers/use-chat-message-navigation.ts';
import { ChatFooterSurface, chatFooterClearanceClassName } from './chat-footer-surface.tsx';
import { ChatScrollPositionMemory } from './chat-scroll-position-memory.tsx';
import { ChatTranscriptLoadingIndicator } from './chat-transcript-loading-indicator.tsx';
import type { TranscriptActiveReply } from './transcript-contract.ts';

export function ChatDetailFrame({
    activeReplies,
    chatId,
    empty,
    error,
    body,
    fetchOlderHistory,
    footer,
    hasOlderHistory = false,
    header,
    historyLoaded,
    hasTransientTimelineContent = false,
    isFetchingOlderHistory = false,
    isPending,
    rowCount,
    scrollerRef,
    timelineContent,
    transcriptRef,
}: {
    activeReplies: readonly TranscriptActiveReply[];
    chatId: string;
    empty: React.ReactNode;
    error?: unknown;
    body?: React.ReactNode;
    fetchOlderHistory?: () => void;
    footer: React.ReactNode;
    hasOlderHistory?: boolean;
    header?: React.ReactNode;
    historyLoaded: boolean;
    hasTransientTimelineContent?: boolean;
    isFetchingOlderHistory?: boolean;
    isPending: boolean;
    rowCount: number;
    /** Receives the scroller's own jump, for a caller outside it (message reveal). */
    scrollerRef?: React.RefObject<ScrollToMessage | null>;
    timelineContent: (scrollContentRef: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
    /** The transcript's content element, for a caller that finds its own rows (message reveal). */
    transcriptRef?: React.RefObject<HTMLDivElement | null>;
}) {
    const viewportRef = React.useRef<HTMLDivElement | null>(null);
    const ownContentRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = transcriptRef ?? ownContentRef;
    const hasActiveReply = activeReplies.length > 0;
    const hasTimelineContent = chatTimelineHasContent({
        activeReplyCount: activeReplies.length,
        hasTransientTimelineContent,
        rowCount,
    });
    const isInitialTranscriptPending = isPending && !historyLoaded && !hasActiveReply;
    const handleScroll = () => {
        const viewport = viewportRef.current;

        if (!viewport || viewport.scrollTop > 160 || !hasOlderHistory || isFetchingOlderHistory) {
            return;
        }

        fetchOlderHistory?.();
    };

    return (
        <MessageScrollerProvider autoScroll={hasTimelineContent} defaultScrollPosition="end">
            {scrollerRef ? <MessageScrollerJump target={scrollerRef} /> : null}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="relative flex min-w-0 flex-1 flex-col">
                    {header}
                    <ChatFooterSurface footer={footer}>
                        {body === undefined ? (
                            <>
                                <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
                                    <ChatTranscriptLoadingIndicator
                                        className="shrink-0"
                                        visible={isInitialTranscriptPending}
                                    />
                                </div>
                                <MessageScroller>
                                    <MessageScrollerViewport
                                        // The conversation scrolls behind the
                                        // floating composer and hugs it at the end:
                                        // the bottom padding is the measured footer
                                        // plus a small gap. New sends resume
                                        // following the bottom once their
                                        // optimistic rows have committed.
                                        className={`px-5 pt-4 ${chatFooterClearanceClassName}`}
                                        onScroll={handleScroll}
                                        ref={viewportRef}
                                    >
                                        {isInitialTranscriptPending ? null : error ? (
                                            <MessageScrollerContent className="w-full">
                                                <div className="px-2 py-4 text-muted text-sm">
                                                    Unable to load this chat transcript right now.
                                                </div>
                                            </MessageScrollerContent>
                                        ) : hasTimelineContent ? (
                                            timelineContent(contentRef)
                                        ) : (
                                            // Sized to the scroller's own content box
                                            // rather than viewport math, so the state
                                            // centers on the visible transcript without
                                            // outgrowing the padding already reserved.
                                            <MessageScrollerContent className="h-full w-full">
                                                <div className="flex h-full items-center justify-center">
                                                    {empty}
                                                </div>
                                            </MessageScrollerContent>
                                        )}
                                    </MessageScrollerViewport>
                                    <ChatScrollPositionMemory
                                        chatId={chatId}
                                        enabled={hasTimelineContent && !isInitialTranscriptPending}
                                        key={chatId}
                                        viewportRef={viewportRef}
                                    />
                                    {hasTimelineContent ? (
                                        <MessageScrollerButton
                                            aria-label="Jump to latest message"
                                            className="z-10 data-[direction=end]:bottom-[calc(var(--chat-footer-height,0px)+1rem)]"
                                            direction="end"
                                        />
                                    ) : null}
                                </MessageScroller>
                            </>
                        ) : (
                            <div className="flex size-full min-h-0 flex-col overflow-hidden">
                                {body}
                            </div>
                        )}
                    </ChatFooterSurface>
                </div>
            </div>
        </MessageScrollerProvider>
    );
}

/** Hands the scroller's jump to a ref outside its provider while the transcript is shown. */
function MessageScrollerJump({ target }: { target: React.RefObject<ScrollToMessage | null> }) {
    const { scrollToMessage } = useMessageScroller();
    React.useLayoutEffect(() => {
        target.current = (id) => scrollToMessage(id, { align: 'center', behavior: 'instant' });
        return () => {
            target.current = null;
        };
    }, [scrollToMessage, target]);
    return null;
}

export function chatTimelineHasContent(input: {
    activeReplyCount: number;
    hasTransientTimelineContent: boolean;
    rowCount: number;
}) {
    return input.rowCount > 0 || input.activeReplyCount > 0 || input.hasTransientTimelineContent;
}
