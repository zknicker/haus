import * as React from 'react';

// The side pane's width. The rail, the pane, and the band's side strip track
// it live during a drag, so it is an external store. Session-only: how much
// room the side pane needs is situational.
export const sidePaneWidthLimits = {
    default: 560,
    /** The routed page always keeps at least this much room beside the side pane. */
    mainMin: 360,
    max: 960,
    min: 420,
    /** How far the side pane may squeeze when the window is too narrow for both minimums. */
    squeezedMin: 280,
} as const;

/** `available`: the row holding the routed page and the pane; null while unmeasured. */
let store = { available: null as number | null, width: sidePaneWidthLimits.default as number };
const listeners = new Set<() => void>();

/**
 * The side pane's resizable width. Attach `ref` to the pane; its parent row is
 * measured, so the shown width leaves the routed page its minimum.
 */
export function useSidePaneWidth() {
    const width = useSidePaneShownWidth();
    const available = React.useSyncExternalStore(
        subscribe,
        () => store.available,
        () => null
    );
    const ref = React.useCallback((element: HTMLElement | null) => {
        const row = element?.parentElement;
        if (!row) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => {
            if (entry) {
                update({ ...store, available: entry.contentRect.width });
            }
        });
        observer.observe(row);
        return () => observer.disconnect();
    }, []);
    return {
        maxWidth: clampSidePaneWidth(sidePaneWidthLimits.max, available),
        minWidth: clampSidePaneWidth(sidePaneWidthLimits.min, available),
        ref,
        setWidth,
        width,
    };
}

/** The pane's shown width, for chrome that lines up with it (the band's side strip). */
export function useSidePaneShownWidth(): number {
    return React.useSyncExternalStore(
        subscribe,
        () => clampSidePaneWidth(store.width, store.available),
        () => sidePaneWidthLimits.default
    );
}

/**
 * Clamps a side pane width to its limits and to `available` (null while
 * unmeasured). A narrow row shrinks the pane before the routed page, down to
 * `squeezedMin`.
 */
export function clampSidePaneWidth(width: number, available: number | null): number {
    const { mainMin, max, min, squeezedMin } = sidePaneWidthLimits;
    const room = available === null ? max : available - mainMin;
    const upper = Math.max(squeezedMin, Math.min(max, room));
    const lower = Math.min(min, upper);
    return Math.min(upper, Math.max(lower, Math.round(width)));
}

function setWidth(next: number) {
    update({ ...store, width: clampSidePaneWidth(next, null) });
}

function update(next: typeof store) {
    if (next.available === store.available && next.width === store.width) {
        return;
    }
    store = next;
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
