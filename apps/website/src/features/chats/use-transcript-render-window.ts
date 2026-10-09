import * as React from 'react';
import { getRememberedChatScrollPosition } from './chat-scroll-position-memory.tsx';
import type { TranscriptRenderRow } from './chat-transcript-row-model.ts';
import {
    createTranscriptRenderWindow,
    type TranscriptRenderWindow,
    type TranscriptWindowAnchor,
} from './transcript-render-window.ts';

/** What a caller outside the transcript (message reveal) can ask of its window. */
export interface TranscriptRenderWindowHandle {
    /** Renders the rows around a loaded message; true when the caller must wait a frame to find it. */
    renderMessage(messageId: string): boolean;
}

/**
 * The transcript's render window, opened where the transcript will first show:
 * the row the scroll memory restores, or the end. Heights come from
 * `window.innerHeight`, which reads no layout on the switch path.
 */
export function useTranscriptRenderWindow(
    rows: readonly TranscriptRenderRow[],
    chatId: string | undefined,
    handleRef?: React.RefObject<TranscriptRenderWindowHandle | null>
): TranscriptRenderWindow {
    const [renderWindow] = React.useState(createTranscriptRenderWindow);
    renderWindow.admit(rows, getOpeningAnchor(chatId), getViewportHeight());
    const rowsRef = React.useRef(rows);

    React.useLayoutEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    React.useLayoutEffect(() => {
        if (!handleRef) {
            return;
        }
        handleRef.current = {
            renderMessage: (messageId) =>
                renderWindow.renderAroundMessage(rowsRef.current, messageId, getViewportHeight()),
        };
        return () => {
            handleRef.current = null;
        };
    }, [handleRef, renderWindow]);

    React.useEffect(() => {
        renderWindow.connect();
        return () => renderWindow.disconnect();
    }, [renderWindow]);

    return renderWindow;
}

/** Server rendering has no window; without IntersectionObserver every row renders anyway. */
function getViewportHeight() {
    return typeof window === 'undefined' ? 0 : window.innerHeight;
}

function getOpeningAnchor(chatId: string | undefined): TranscriptWindowAnchor {
    const position = chatId ? getRememberedChatScrollPosition(chatId) : undefined;
    return position?.atEnd === false ? { kind: 'row', rowId: position.messageId } : { kind: 'end' };
}
