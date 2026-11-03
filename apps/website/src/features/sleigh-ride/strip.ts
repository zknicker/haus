/**
 * The air the ride flies through: the full width of the page's scroller, from
 * the scroller's top down to the first content row the greeting leads. The
 * ride's layer covers that box; its canvas then starts under the page band
 * (CSS: `--app-shell-band-height`), so it never reaches the trail.
 *
 * The box is relative to the greeting's header (the layer's containing
 * block) and in scroll-content space, so it does not move as the page scrolls.
 */
export interface StripBox {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
}

export interface StripRects {
    /** The greeting header's viewport origin. */
    readonly header: { readonly left: number; readonly top: number };
    /** The viewport top of the row the header sits in (its tallest member's top). */
    readonly rowTop: number;
    readonly scroller: {
        readonly clientLeft: number;
        readonly clientTop: number;
        readonly clientWidth: number;
        readonly left: number;
        readonly scrollTop: number;
        readonly top: number;
    };
}

export function stripBox({ header, rowTop, scroller }: StripRects): StripBox {
    const contentTop = scroller.top + scroller.clientTop - scroller.scrollTop;
    const contentLeft = scroller.left + scroller.clientLeft;
    return {
        height: Math.max(0, rowTop - contentTop),
        left: contentLeft - header.left,
        top: contentTop - header.top,
        // A pixel short of the edge, so subpixel rounding never adds a horizontal scrollbar.
        width: Math.max(0, scroller.clientWidth - 1),
    };
}

/** Reads the live rects for the layer's header, or null outside a scrolling page. */
export function readStripRects(header: HTMLElement): StripRects | null {
    const row = header.parentElement;
    const scroller = row ? scrollParent(row) : null;
    if (!(row && scroller)) {
        return null;
    }
    const headerRect = header.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
        header: { left: headerRect.left, top: headerRect.top },
        rowTop: row.getBoundingClientRect().top,
        scroller: {
            clientLeft: scroller.clientLeft,
            clientTop: scroller.clientTop,
            clientWidth: scroller.clientWidth,
            left: scrollerRect.left,
            scrollTop: scroller.scrollTop,
            top: scrollerRect.top,
        },
    };
}

/** The nearest ancestor that scrolls vertically: the page's own scroller. */
export function scrollParent(element: HTMLElement): HTMLElement | null {
    for (let node = element.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === 'auto' || overflowY === 'scroll') {
            return node;
        }
    }
    return null;
}
