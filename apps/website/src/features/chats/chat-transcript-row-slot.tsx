import * as React from 'react';
import { MessageScrollerItem } from '../../components/chats/message-scroller.tsx';
import {
    getEstimatedTranscriptRowSize,
    type TranscriptRenderRow,
} from './chat-transcript-row-model.ts';
import { TranscriptRenderRowItem } from './chat-transcript-rows.tsx';
import type { TranscriptRenderWindow } from './transcript-render-window.ts';

/**
 * One transcript row's scroller item. Outside the render window it is an empty
 * placeholder at the row's estimated height with no `messageId`, so the
 * scroller neither reports it as seen (read tracking) nor anchors or restores
 * to it; it renders its content once the window takes it. Day dividers carry
 * no `messageId` either: an older page from the same day slides in below the
 * divider, which keeps its place at the top, so a divider anchor would hold
 * still while the rows under it moved.
 */
export function TranscriptRowSlot({
    renderWindow,
    row,
}: {
    renderWindow: TranscriptRenderWindow;
    row: TranscriptRenderRow;
}) {
    const rendered = React.useSyncExternalStore(
        renderWindow.subscribe,
        () => renderWindow.isRendered(row),
        () => true
    );
    const placeholderRef = React.useRef<HTMLDivElement | null>(null);
    const observe = React.useCallback(
        (element: HTMLDivElement | null) => {
            if (placeholderRef.current) {
                renderWindow.unobserve(placeholderRef.current);
            }
            placeholderRef.current = element;
            if (element) {
                renderWindow.observe(element, row);
            }
        },
        [renderWindow, row]
    );

    return (
        <MessageScrollerItem
            // Rows keep the scroller's `content-visibility: auto`, so off-screen
            // rows skip style, layout, and paint (and a revealed kept chat view
            // restyles only what is on screen). Its paint containment would clip
            // what a turn draws past its row: the hover action island (-top-4)
            // and the hover wash (-mx-5). The clip margin gives them that room.
            className="[overflow-clip-margin:1.25rem]"
            // Names the row it holds, for probes that need rows outside the window.
            data-transcript-placeholder={rendered ? undefined : row.id}
            messageId={rendered && row.kind === 'entry' ? row.id : undefined}
            ref={rendered ? undefined : observe}
            // A placeholder is never the browser's scroll anchor: when it
            // renders at its real height, the rendered rows around it hold still.
            style={
                rendered
                    ? undefined
                    : { height: getEstimatedTranscriptRowSize(row), overflowAnchor: 'none' }
            }
        >
            {rendered ? <TranscriptRenderRowItem row={row} /> : null}
        </MessageScrollerItem>
    );
}
