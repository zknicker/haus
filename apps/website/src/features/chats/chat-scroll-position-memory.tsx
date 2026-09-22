import * as React from 'react';
import {
    useMessageScroller,
    useMessageScrollerScrollable,
    useMessageScrollerVisibility,
} from '../../components/chats/message-scroller.tsx';

interface ChatScrollPosition {
    atEnd: boolean;
    messageId: string | null;
}

const initialScrollFrameLimit = 12;
const scrollEndTolerance = 8;
const rememberedChatScrollPositions = new Map<string, ChatScrollPosition>();

export function ChatScrollPositionMemory({
    chatId,
    enabled,
    viewportRef,
}: {
    chatId: string;
    enabled: boolean;
    viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
    const scroller = useMessageScroller();
    const scrollable = useMessageScrollerScrollable();
    const visibility = useMessageScrollerVisibility();
    const initialPositionRef = React.useRef<ChatScrollPosition | null>(
        rememberedChatScrollPositions.get(chatId) ?? null
    );
    const restoredRef = React.useRef(false);
    const backgroundPositionRef = React.useRef<ChatScrollPosition | null>(null);

    React.useLayoutEffect(() => {
        initialPositionRef.current = rememberedChatScrollPositions.get(chatId) ?? null;
        restoredRef.current = false;
    }, [chatId]);

    React.useEffect(() => {
        if (!enabled || restoredRef.current) {
            return;
        }

        let frameId: number | null = null;
        let frames = 0;
        let cancelled = false;

        const restorePosition = () => {
            if (cancelled) {
                return;
            }

            const position = initialPositionRef.current;

            if (position?.atEnd === false && position.messageId) {
                const restored = scroller.scrollToMessage(position.messageId, {
                    align: 'start',
                    behavior: 'auto',
                });

                if (restored) {
                    restoredRef.current = true;
                    return;
                }
            }

            scroller.scrollToEnd({ behavior: 'auto' });

            if (isViewportAtEnd(viewportRef.current) || frames >= initialScrollFrameLimit) {
                restoredRef.current = true;
                return;
            }

            frames += 1;
            frameId = window.requestAnimationFrame(restorePosition);
        };

        frameId = window.requestAnimationFrame(restorePosition);

        return () => {
            cancelled = true;

            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [enabled, scroller, viewportRef]);

    React.useEffect(() => {
        const suspend = () => {
            if (enabled && restoredRef.current && !backgroundPositionRef.current) {
                backgroundPositionRef.current = rememberedChatScrollPositions.get(chatId) ?? {
                    atEnd: !scrollable.end,
                    messageId: null,
                };
            }
        };
        const resume = () => {
            if (document.visibilityState === 'hidden') {
                return;
            }
            const position = backgroundPositionRef.current;
            backgroundPositionRef.current = null;
            if (position?.atEnd) {
                scroller.scrollToEnd({ behavior: 'instant' });
            }
        };
        const visibilityChanged = () => {
            if (document.visibilityState === 'hidden') {
                suspend();
            } else {
                resume();
            }
        };
        window.addEventListener('blur', suspend);
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', visibilityChanged);
        return () => {
            window.removeEventListener('blur', suspend);
            window.removeEventListener('focus', resume);
            document.removeEventListener('visibilitychange', visibilityChanged);
        };
    }, [chatId, enabled, scrollable.end, scroller]);

    React.useEffect(() => {
        if (!(enabled && restoredRef.current) || backgroundPositionRef.current) {
            return;
        }

        const messageId = visibility.currentAnchorId ?? visibility.visibleMessageIds[0] ?? null;
        rememberedChatScrollPositions.set(chatId, {
            atEnd: !scrollable.end,
            messageId,
        });
    }, [chatId, enabled, scrollable.end, visibility.currentAnchorId, visibility.visibleMessageIds]);

    return null;
}

function isViewportAtEnd(viewport: HTMLDivElement | null) {
    if (!viewport) {
        return false;
    }

    const distanceFromEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;

    return distanceFromEnd <= scrollEndTolerance;
}
