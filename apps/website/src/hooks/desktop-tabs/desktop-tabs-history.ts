import {
    type DesktopTab,
    type TabHistory,
    type TabLocation,
    type TabPageState,
    tabHistoryLimit,
} from './desktop-tabs-model.ts';

/** A one-entry tab at `location`. */
export function newTab(tabId: string, location: TabLocation, entryKey: string): DesktopTab {
    return {
        history: { entries: [{ key: entryKey, location, pageState: {} }], index: 0 },
        id: tabId,
    };
}

/** Push drops forward entries, like a browser; replace swaps the current entry. */
export function navigateHistory(
    history: TabHistory,
    location: TabLocation,
    mode: 'push' | 'replace',
    entryKey: string
): TabHistory {
    const entry = { key: entryKey, location, pageState: {} };
    if (mode === 'replace') {
        return {
            entries: history.entries.map((item, index) => (index === history.index ? entry : item)),
            index: history.index,
        };
    }
    return boundHistory({
        entries: [...history.entries.slice(0, history.index + 1), entry],
        index: history.index + 1,
    });
}

/** Back/forward; null when `delta` leaves the history. */
export function goHistory(history: TabHistory, delta: number): TabHistory | null {
    const index = history.index + delta;
    if (delta === 0 || !Number.isInteger(index) || index < 0 || index >= history.entries.length) {
        return null;
    }
    return { entries: history.entries, index };
}

export function savePageStateInHistory(history: TabHistory, pageState: TabPageState): TabHistory {
    return {
        entries: history.entries.map((item, index) =>
            index === history.index
                ? { ...item, pageState: { ...item.pageState, ...pageState } }
                : item
        ),
        index: history.index,
    };
}

/** Keeps at most `tabHistoryLimit` entries, dropping the oldest but never the current one. */
export function boundHistory(history: TabHistory): TabHistory {
    const overflow = history.entries.length - tabHistoryLimit;
    if (overflow <= 0) {
        return history;
    }
    const start = Math.min(overflow, history.index);
    return {
        entries: history.entries.slice(start, start + tabHistoryLimit),
        index: history.index - start,
    };
}

/** Same page and same address: navigating there again would only add a duplicate entry. */
export function sameLocation(a: TabLocation, b: TabLocation) {
    if (a.kind === 'app' && b.kind === 'app') {
        return a.path === b.path;
    }
    if (a.kind === 'browser' && b.kind === 'browser') {
        return a.viewId === b.viewId;
    }
    return a.kind === 'newTab' && b.kind === 'newTab';
}
