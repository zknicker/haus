import {
    type BrowserBounds,
    type BrowserCapture,
    parseBrowserCapture,
} from '../../lib/desktop-browser.ts';

/** The effects one page's native view needs; the hook binds them to Electron and React. */
export interface BrowserCoverIO {
    /** Resolves after the window has composited the current frame. */
    afterFrame: () => Promise<void>;
    /** Captures the page while its native view is still shown; resolves to untrusted bridge output. */
    capture: () => Promise<unknown>;
    /** Shows or releases the snapshot, resolving once a shown snapshot has painted. */
    paint: (image: BrowserCapture | null) => Promise<void>;
    /** Shows the native view at bounds, or hides it with null. */
    place: (bounds: BrowserBounds | null) => Promise<void>;
}

/** One layout pass over the page region: where it sits and what covers it. */
export interface BrowserLayoutReport {
    bounds: BrowserBounds;
    /** The page is off screen (another tab or route), so no snapshot stands in. */
    hidden: boolean;
    /** A product overlay (list, menu, dialog) overlaps the page region. */
    overlay: boolean;
}

/**
 * Sequences a native page view against DOM overlays. Covering captures the page first, paints the
 * snapshot, and only then hides the native view, so an overlay appears to float over the page.
 * Revealing shows the native view first and releases the snapshot after the next paint, so the page
 * never blanks. Every request supersedes the previous one: a stale capture or reveal does nothing.
 */
export function createBrowserCover(io: BrowserCoverIO) {
    let generation = 0;
    let placement = '';
    const isCurrent = (request: number) => request === generation;
    const cover = {
        /** Hides the native view behind a snapshot, or behind the page background when none. */
        async cover(options: { snapshot: boolean }) {
            generation += 1;
            const request = generation;
            const image = options.snapshot
                ? parseBrowserCapture(await io.capture().catch(() => null))
                : null;
            if (!isCurrent(request)) {
                return;
            }
            await io.paint(image);
            if (isCurrent(request)) {
                await io.place(null);
            }
        },
        async reveal(bounds: BrowserBounds) {
            generation += 1;
            const request = generation;
            await io.place(bounds);
            if (!isCurrent(request)) {
                return;
            }
            await io.afterFrame();
            if (isCurrent(request)) {
                await io.paint(null);
            }
        },
        /**
         * Applies a layout report, or does nothing (null) when the placement is unchanged. An open
         * overlay's own changes, such as a list growing or shrinking as the user types, leave the
         * placement at "overlay", so the page is captured once when it opens and revealed once
         * when it closes.
         */
        update(report: BrowserLayoutReport): Promise<void> | null {
            const next = report.hidden
                ? 'hidden'
                : report.overlay
                  ? 'overlay'
                  : JSON.stringify(report.bounds);
            if (next === placement) {
                return null;
            }
            placement = next;
            return report.hidden || report.overlay
                ? cover.cover({ snapshot: !report.hidden })
                : cover.reveal(report.bounds);
        },
        /** Abandons in-flight work when the page unmounts. */
        dispose() {
            generation += 1;
        },
    };
    return cover;
}
