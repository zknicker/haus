import * as React from 'react';
import { useThreadUnreadLanding } from '../../../hooks/threads/use-unread-threads.ts';
import { holdLandedRow } from './thread-landing-hold.ts';

/**
 * The scroller's top visibility inset (`@shadcn/react/message-scroller`'s
 * default previous-item peek). A reply wholly inside it reads as unseen, and
 * the Thread never marks it read.
 */
const previousItemPeekPx = 64;
/** The reply before the landing that stays in view below the top fade, so the reader has context. */
const landingContextPx = 48;
/** How much of the first unread reply must show above the fold to count as already in view. */
const readableReplyPx = 48;

/**
 * Opens a Thread at its first unread reply rather than its top (ADR 0043), so
 * the reply the viewer came for is in view, wherever the Thread was opened
 * from. The landing is `thread.listUnread`'s first counted reply, decided
 * once per Thread from a settled list: reading moves the row, and the view
 * must not chase it. Like Slack, a reply already in view from the start
 * position — a short Thread, or one above the fold — keeps the anchor in view
 * and scrolls nowhere; a reply below the fold scrolls up to sit clear of the
 * top fade with the reply before it peeking, held there while the Thread's
 * layout settles. Renders inside the Thread's
 * `MessageScrollerProvider`, after its `MessageScroller`, so the rows exist
 * when it lands.
 */
export function ThreadUnreadLanding({
    sequenceByEntryId,
    serverId,
    threadChatId,
    viewportRef,
}: {
    /** The loaded replies' entries in order, each with its newest sequence; empty until they load. */
    sequenceByEntryId: ReadonlyMap<string, number>;
    serverId: string;
    threadChatId: string | undefined;
    viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
    const landing = useThreadUnreadLanding(serverId, threadChatId);
    const decidedFor = React.useRef<string | null>(null);
    // The hold releases itself (user scroll intent or its settle window), never
    // on effect cleanup: dev StrictMode's remount would end it at once.
    const releaseHold = React.useRef<(() => void) | null>(null);
    const ready = threadChatId !== undefined && sequenceByEntryId.size > 0 && landing !== undefined;

    React.useLayoutEffect(() => {
        if (!ready || decidedFor.current === threadChatId) {
            return;
        }
        decidedFor.current = threadChatId;
        const entryId = landing ? threadLandingEntryId(sequenceByEntryId, landing.sequence) : null;
        const viewport = viewportRef.current;
        const row = entryId ? viewport?.querySelector(messageItemSelector(entryId)) : null;
        if (!(viewport && row)) {
            return;
        }
        const top = threadLandingScrollTop(measureLanding(viewport, row));
        if (top !== null) {
            viewport.scrollTo({ behavior: 'instant', top });
            releaseHold.current?.();
            releaseHold.current = holdLandedRow(viewport, row);
        }
    }, [landing, ready, sequenceByEntryId, threadChatId, viewportRef]);

    return null;
}

/** The viewport and landing row, in the viewport's scroll coordinates. */
export interface LandingGeometry {
    /** Height hidden under the bottom fade and floating composer. */
    bottomInset: number;
    maxScrollTop: number;
    rowHeight: number;
    /** The row's top, measured from the top of the scrolled content. */
    rowTop: number;
    scrollTop: number;
    /** Height of the top fade band shown once the viewport scrolls. */
    topFade: number;
    viewportHeight: number;
}

/**
 * Where the viewport scrolls to land, or null to stay put. A row whose start
 * already shows above the fold stays put. Otherwise the row lands below the
 * top fade and the scroller's peek inset, plus a little context, clamped to
 * the end so a Thread never grows empty space below its last reply.
 */
export function threadLandingScrollTop(geometry: LandingGeometry): number | null {
    const { bottomInset, maxScrollTop, rowHeight, rowTop, scrollTop, topFade, viewportHeight } =
        geometry;
    const rowViewportTop = rowTop - scrollTop;
    const fold = viewportHeight - bottomInset;
    if (rowViewportTop >= 0 && rowViewportTop + Math.min(rowHeight, readableReplyPx) <= fold) {
        return null;
    }
    const offset = Math.max(topFade, previousItemPeekPx) + landingContextPx;
    return Math.min(Math.max(0, rowTop - offset), maxScrollTop);
}

/**
 * The entry holding the first unread reply: the first whose newest sequence
 * reaches it. Null when no loaded entry reaches it.
 */
export function threadLandingEntryId(
    sequenceByEntryId: ReadonlyMap<string, number>,
    firstUnreadSequence: number
): string | null {
    for (const [entryId, sequence] of sequenceByEntryId) {
        if (sequence >= firstUnreadSequence) {
            return entryId;
        }
    }
    return null;
}

function messageItemSelector(entryId: string): string {
    return `[data-slot="message-scroller-item"][data-message-id="${CSS.escape(entryId)}"]`;
}

// The edge fades are the viewport's siblings in the scroller root; each keeps
// its layout height while hidden, so the top band measures before it shows.
function measureLanding(viewport: HTMLElement, row: Element): LandingGeometry {
    const viewportRect = viewport.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return {
        bottomInset: edgeFadeHeight(viewport, 'bottom'),
        maxScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
        rowHeight: rowRect.height,
        rowTop: rowRect.top - viewportRect.top + viewport.scrollTop,
        scrollTop: viewport.scrollTop,
        topFade: edgeFadeHeight(viewport, 'top'),
        viewportHeight: viewport.clientHeight,
    };
}

function edgeFadeHeight(viewport: HTMLElement, side: 'bottom' | 'top'): number {
    const fade = viewport.parentElement?.querySelector(
        `:scope > [data-slot="transcript-edge-blur"][data-side="${side}"]`
    );
    return fade?.getBoundingClientRect().height ?? 0;
}
