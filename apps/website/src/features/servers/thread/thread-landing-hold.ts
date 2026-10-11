/** How long a landing holds its row in place while the Thread's layout settles. */
const settleMs = 1500;
const userScrollIntents = ['keydown', 'pointerdown', 'touchmove', 'wheel'] as const;

/**
 * Holds a just-landed row at its viewport offset while the Thread settles.
 * Rows above it (inline reply cards, media, the Task panel over the viewport)
 * can finish rendering after the landing and would otherwise shift it under
 * the top fade. The hold ends at the first user scroll intent or once the
 * settle window passes; the returned release ends it early.
 */
export function holdLandedRow(viewport: HTMLElement, row: Element): () => void {
    const offset = viewportOffset(viewport, row);
    const restore = () => {
        const drift = viewportOffset(viewport, row) - offset;
        if (row.isConnected && Math.abs(drift) > 0.5) {
            viewport.scrollTop += drift;
        }
    };
    const observer = new ResizeObserver(restore);
    observer.observe(viewport);
    if (viewport.firstElementChild) {
        observer.observe(viewport.firstElementChild);
    }
    const timeout = window.setTimeout(release, settleMs);
    for (const intent of userScrollIntents) {
        viewport.addEventListener(intent, release, { passive: true });
    }

    function release() {
        observer.disconnect();
        window.clearTimeout(timeout);
        for (const intent of userScrollIntents) {
            viewport.removeEventListener(intent, release);
        }
    }
    return release;
}

function viewportOffset(viewport: HTMLElement, row: Element): number {
    return row.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}
