import * as React from 'react';

// The split column's width. The rail and the column track it live during a
// drag, so it is an external store. Session-only like the artifact pane: how
// much room a split needs is situational, and the split itself is per window.
export const splitPaneWidthLimits = {
    default: 560,
    /** The main column always keeps at least this much room beside the split. */
    mainMin: 360,
    max: 960,
    min: 420,
    /** How far the split may squeeze when the window is too narrow for both minimums. */
    squeezedMin: 280,
} as const;

let paneWidth: number = splitPaneWidthLimits.default;
const listeners = new Set<() => void>();

/**
 * The split's shown width, clamped to the room its row leaves after the main
 * column's minimum. Attach `ref` to the split column; its parent row is measured.
 */
export function useSplitPaneWidth() {
    const stored = React.useSyncExternalStore(
        subscribe,
        () => paneWidth,
        () => splitPaneWidthLimits.default
    );
    const [available, setAvailable] = React.useState<number | null>(null);
    const ref = React.useCallback((element: HTMLElement | null) => {
        const row = element?.parentElement;
        if (!row) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                setAvailable(entry.contentRect.width);
            }
        });
        observer.observe(row);
        return () => observer.disconnect();
    }, []);
    return {
        maxWidth: clampSplitPaneWidth(splitPaneWidthLimits.max, available),
        minWidth: clampSplitPaneWidth(splitPaneWidthLimits.min, available),
        ref,
        setWidth,
        width: clampSplitPaneWidth(stored, available),
    };
}

/**
 * Clamps a split width to its limits and to `available` (the row holding main
 * and split; null while unmeasured). A narrow row shrinks the split before the
 * main column, down to `squeezedMin`.
 */
export function clampSplitPaneWidth(width: number, available: number | null): number {
    const { mainMin, max, min, squeezedMin } = splitPaneWidthLimits;
    const room = available === null ? max : available - mainMin;
    const upper = Math.max(squeezedMin, Math.min(max, room));
    const lower = Math.min(min, upper);
    return Math.min(upper, Math.max(lower, Math.round(width)));
}

function setWidth(next: number) {
    paneWidth = clampSplitPaneWidth(next, null);
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
