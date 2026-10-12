import { ScrollShadow } from '@heroui/react';
import type * as React from 'react';

/** Marks a strip tile's own control, so arrow keys can walk the row. */
export const mediaStripTileAttribute = 'data-media-strip-tile';

/** The control around a tile's ChatAttachment: it snaps, never shrinks, and draws focus inside. */
export const mediaStripTriggerClassName =
    'chat-attachment-trigger block shrink-0 snap-start rounded-xl text-start outline-none';

/** A file or artifact tile's mark, in pixels like the kind icon (the spacing scale is not 4px here). */
export const mediaStripMarkSize = 36;

/** The ChatAttachment modifier that sizes every tile to the strip's one box. */
export const mediaStripTileClassName = 'chat-attachment--strip-tile';

/** A tile's reserved box while its bytes or metadata arrive: blank, never a placeholder graphic. */
export const mediaStripPlaceholderClassName =
    'h-(--chat-media-tile-height) w-(--chat-media-tile-width) shrink-0 snap-start rounded-xl border border-border';

/**
 * Everything under one message, as one evenly sized row that scrolls sideways
 * when it outgrows the column: native overflow with scroll snap, the stock
 * edge fade where items continue, and no scrollbar. Every item stays
 * reachable by scrolling, Tab, or the arrow keys; nothing hides behind a count.
 */
export function MessageMediaStrip({ children }: { children: React.ReactNode }) {
    return (
        <ScrollShadow
            className="flex min-w-0 max-w-full snap-x snap-mandatory gap-2 overscroll-x-contain"
            data-slot="message-media-strip"
            hideScrollBar
            onKeyDown={walkTiles}
            orientation="horizontal"
            size={32}
        >
            {children}
        </ScrollShadow>
    );
}

/** Left and Right move focus to the neighbouring tile; the browser scrolls it into view. */
function walkTiles(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = stepByKey[event.key];
    const target = event.target;
    if (!(step && target instanceof HTMLElement && target.hasAttribute(mediaStripTileAttribute))) {
        return;
    }
    const tiles = [
        ...event.currentTarget.querySelectorAll<HTMLElement>(`[${mediaStripTileAttribute}]`),
    ];
    const next = tiles[tiles.indexOf(target) + step];
    if (next) {
        event.preventDefault();
        next.focus();
    }
}

const stepByKey: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };
