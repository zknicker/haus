import * as React from 'react';
import type { Slot } from './tab-drag-geometry.ts';

/** What the rows draw while tabs ride this window's band: which tabs, at which slot. */
export interface TabDragView {
    /** The dragged tabs in row order; one, or a multi-selection. */
    draggingIds: readonly string[];
    slot: Slot;
    /**
     * The tabs ride here from another window (relayed): adopted only as a
     * preview, so they are not viewed here until the drop commits them.
     */
    visiting: boolean;
}

/**
 * The drag's React-facing state. It changes only when the dragged tabs change
 * slot, never per pointer move: the pointer offset is painted straight onto
 * the dragged tabs' elements.
 */
export function createTabDragView() {
    let value: TabDragView | null = null;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set(next: TabDragView | null) {
            if (sameView(value, next)) {
                return;
            }
            value = next;
            for (const listener of listeners) {
                listener();
            }
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

export type TabDragViewStore = ReturnType<typeof createTabDragView>;

/**
 * The window's one drag view, shared by the band (rows draw the dragged tab
 * at its slot) and the body (the tab layer previews which tab each pane
 * shows). Provided by the desktop Server layout above both.
 */
export const TabDragViewContext = React.createContext<TabDragViewStore | null>(null);

export function useTabDragViewStore(): TabDragViewStore {
    const store = React.use(TabDragViewContext);
    if (!store) {
        throw new Error('The tab drag view needs TabDragViewContext.');
    }
    return store;
}

/** The drag as drawn this frame, or null while no tabs ride this window's band. */
export function useTabDragView(): TabDragView | null {
    const store = useTabDragViewStore();
    return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}

function sameView(a: TabDragView | null, b: TabDragView | null): boolean {
    if (a === null || b === null) {
        return a === b;
    }
    return (
        a.draggingIds.length === b.draggingIds.length &&
        a.draggingIds.every((id, index) => b.draggingIds[index] === id) &&
        a.visiting === b.visiting &&
        a.slot.row === b.slot.row &&
        a.slot.index === b.slot.index
    );
}
