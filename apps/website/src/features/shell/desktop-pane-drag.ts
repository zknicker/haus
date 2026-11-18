import * as React from 'react';
import { coverBrowserViews } from '../../lib/desktop-browser.ts';

/**
 * Window-level pane chrome state the band and the body share without a
 * provider between them (they are siblings in the Server layout):
 *
 * - **Pointer drags.** Native web views sit above the App and swallow
 *   pointermove and pointerup, so a pane divider drag that crosses a web page
 *   would stall. For the whole drag every placed web view swaps to its still
 *   snapshot (`coverBrowserViews`). Tab drags cover views themselves for the
 *   whole gesture, tear-off included (`tab-drag/tab-drag-engine.ts`).
 * - **The split.** The primary pane's share of the body, in percent, so a
 *   remounted pane group restores it, and the divider element, so the band
 *   can line its right tab row up with the divider (use-split-row-geometry.ts).
 */
export function beginDesktopPointerDrag(): () => void {
    const release = coverBrowserViews();
    // The release usually lands on App DOM once the views hide; a blur ends it
    // too, so a drag the window never sees end cannot leave the views covered.
    const end = () => {
        window.removeEventListener('pointerup', end, true);
        window.removeEventListener('pointercancel', end, true);
        window.removeEventListener('blur', end);
        release();
    };
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', end);
    return end;
}

/** The primary pane's percent of the body while two panes show. */
export function usePrimaryPaneShare(): number {
    return React.useSyncExternalStore(shareStore.subscribe, shareStore.get, shareStore.get);
}

export function setPrimaryPaneShare(percent: number) {
    if (Number.isFinite(percent) && percent > 0 && percent < 100) {
        shareStore.set(percent);
    }
}

/** The pane divider's element while two panes show. */
export function useDesktopPaneDivider(): HTMLElement | null {
    return React.useSyncExternalStore(dividerStore.subscribe, dividerStore.get, dividerStore.get);
}

export function setDesktopPaneDivider(element: HTMLElement | null) {
    dividerStore.set(element);
}

function createStore<T>(initial: T) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set(next: T) {
            if (Object.is(next, value)) {
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

const shareStore = createStore(50);
const dividerStore = createStore<HTMLElement | null>(null);
