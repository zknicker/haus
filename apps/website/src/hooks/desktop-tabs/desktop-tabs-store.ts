import type { DesktopTabsState, TabPageState } from './desktop-tabs-model.ts';
import { type DesktopTabsAction, desktopTabsReducer } from './desktop-tabs-reducer.ts';

/**
 * One window's tabs outside React (ADR 0039), so each consumer subscribes to
 * just the slice it renders (`useDesktopTabsSelector`) instead of the whole
 * state. Two views of the same state:
 *
 * - `snapshot()` is what React renders. It moves only on a dispatch, and
 *   every move notifies `subscribe` listeners.
 * - `latest()` also carries page state (`savePageState`) saved since the last
 *   dispatch. Scroll memory saves page state on every scroll pause; folding
 *   it in silently keeps a scroll from re-rendering every tab page, while
 *   persistence, closed tabs, duplicates, and transfers, which all start from
 *   `latest()`, never lose an offset. The next dispatch publishes it.
 */
export interface DesktopTabsStore {
    dispatch: (action: DesktopTabsAction) => void;
    /** Rendered state plus page state saved since; for event handlers, effects, and persistence. */
    latest: () => DesktopTabsState;
    /** Saves page state into the tab's current entry without re-rendering anything. */
    savePageState: (tabId: string, pageState: TabPageState) => void;
    /** The state React renders; stable between dispatches. */
    snapshot: () => DesktopTabsState;
    /** Fires after each dispatch that changes the rendered state. */
    subscribe: (listener: () => void) => () => void;
    /** Fires on any change to `latest()`, page state included (persistence). */
    subscribeLatest: (listener: () => void) => () => void;
}

export function createDesktopTabsStore(initial: DesktopTabsState): DesktopTabsStore {
    let latest = initial;
    let rendered = initial;
    const renderListeners = new Set<() => void>();
    const latestListeners = new Set<() => void>();
    const listen = (listeners: Set<() => void>) => (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    const emit = (listeners: Set<() => void>) => {
        for (const listener of [...listeners]) {
            listener();
        }
    };
    const apply = (action: DesktopTabsAction) => {
        const next = desktopTabsReducer(latest, action);
        if (next === latest) {
            return false;
        }
        latest = next;
        emit(latestListeners);
        return true;
    };
    return {
        dispatch: (action) => {
            apply(action);
            // Also publishes page state saved since the last dispatch, even when this action is a no-op.
            if (latest !== rendered) {
                rendered = latest;
                emit(renderListeners);
            }
        },
        latest: () => latest,
        savePageState: (tabId, pageState) => {
            apply({ kind: 'savePageState', pageState, tabId });
        },
        snapshot: () => rendered,
        subscribe: listen(renderListeners),
        subscribeLatest: listen(latestListeners),
    };
}
