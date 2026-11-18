import * as React from 'react';
import {
    useMessageScroller,
    useMessageScrollerScrollable,
} from '../../components/chats/message-scroller.tsx';
import { useViewShown, useViewShownChange } from '../../hooks/desktop-tabs/view-shown.ts';

/** Where a transcript sat: at its end, or a row and that row's offset from the viewport top. */
export type ChatScrollPosition =
    | { atEnd: true }
    | { atEnd: false; messageId: string; offset: number };

const scrollEndTolerance = 8;
const rememberedChatScrollPositions = new Map<string, ChatScrollPosition>();

/** Where a chat's transcript will restore to, so its render window opens there. */
export function getRememberedChatScrollPosition(chatId: string): ChatScrollPosition | undefined {
    return rememberedChatScrollPositions.get(chatId);
}

/**
 * The transcript's one scroll restorer. It restores in a layout effect, so the
 * first painted frame already shows the remembered row (or the end). It tracks
 * the position as the transcript scrolls and commits it when the effect cleans
 * up (when the chat view unmounts, and when its desktop tab hides inside
 * `<Activity>`, whose hidden subtree loses its scroll offset, so that reveal
 * restores again) and when its kept chat view hides (`KeptChatViews`). A
 * kept view stays laid out at its offset while hidden, so its reveal needs no
 * restore.
 */
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
    const viewShown = useViewShown();
    const latestRef = React.useRef<ChatScrollPosition | null>(null);
    useViewShownChange((shown) => {
        if (!shown && latestRef.current) {
            rememberedChatScrollPositions.set(chatId, latestRef.current);
        }
    });
    const backgroundAtEndRef = React.useRef<boolean | null>(null);

    React.useLayoutEffect(() => {
        if (!enabled) {
            return;
        }
        const position = rememberedChatScrollPositions.get(chatId);
        if (position?.atEnd === false) {
            const restored = scroller.scrollToMessage(position.messageId, {
                align: 'start',
                behavior: 'auto',
                // `align: 'start'` lands the row at the viewport's top edge
                // minus this margin, which puts it back at its saved offset.
                scrollMargin: position.offset,
            });
            if (!restored) {
                scroller.scrollToEnd({ behavior: 'auto' });
            }
        }
        // Read on scroll, a frame later, when layout is already clean. Reading
        // in the cleanup instead would force a layout in the middle of the
        // commit that hides this view and shows the next.
        const viewport = viewportRef.current;
        latestRef.current = null;
        let frame: number | null = null;
        const onScroll = () => {
            frame ??= window.requestAnimationFrame(() => {
                frame = null;
                latestRef.current = readChatScrollPosition(viewport) ?? latestRef.current;
            });
        };
        viewport?.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            viewport?.removeEventListener('scroll', onScroll);
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
            }
            if (latestRef.current) {
                rememberedChatScrollPositions.set(chatId, latestRef.current);
            }
        };
    }, [chatId, enabled, scroller, viewportRef]);

    // A backgrounded window can miss the resize that keeps the end in view, so
    // a transcript left at its end returns to it when the window comes back.
    React.useEffect(() => {
        if (!enabled) {
            return;
        }
        // A hidden kept view neither records nor follows: forcing its skipped
        // layout to jump would be wasted work, and its reveal keeps its offset.
        const suspend = () => {
            if (viewShown.isShown()) {
                backgroundAtEndRef.current ??= !scrollable.end;
            }
        };
        const resume = () => {
            if (document.visibilityState === 'hidden') {
                return;
            }
            const atEnd = backgroundAtEndRef.current;
            backgroundAtEndRef.current = null;
            if (atEnd && viewShown.isShown()) {
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
    }, [enabled, scrollable.end, scroller, viewShown]);

    return null;
}

/** Reads the viewport's position from layout; null when it has no laid-out rows to anchor to. */
export function readChatScrollPosition(viewport: HTMLElement | null): ChatScrollPosition | null {
    if (!viewport?.isConnected || viewport.clientHeight === 0) {
        return null;
    }
    const distanceFromEnd = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    if (distanceFromEnd <= scrollEndTolerance) {
        return { atEnd: true };
    }
    const top = viewport.getBoundingClientRect().top;
    for (const row of viewport.querySelectorAll<HTMLElement>(
        '[data-slot="message-scroller-item"][data-message-id]'
    )) {
        const rect = row.getBoundingClientRect();
        const messageId = row.dataset.messageId;
        if (messageId && rect.bottom > top) {
            return { atEnd: false, messageId, offset: rect.top - top };
        }
    }
    return null;
}
