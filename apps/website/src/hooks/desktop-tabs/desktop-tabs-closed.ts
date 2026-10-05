import {
    allTabIds,
    type ClosedDesktopTab,
    closedTabLimit,
    type DesktopTabsState,
    paneOfTab,
} from './desktop-tabs-model.ts';
import { insertTab, removeTab, selectTab } from './desktop-tabs-panes.ts';

/**
 * Close (⌘W) and Reopen Closed Tab (⌘⇧T). A closed tab keeps its whole
 * history and its pane and index, newest last, at most `closedTabLimit`.
 *
 * Closing several tabs at once (a multi-selection) records each as its own
 * closed tab, as Chrome's `TabRestoreService` does, so ⌘⇧T brings them back
 * one at a time. They close right to left, so each records its original index
 * and the leftmost reopens first, every reopen landing where it was.
 */
export function closeTabs(state: DesktopTabsState, tabIds: readonly string[]): DesktopTabsState {
    const ordered = [...new Set(tabIds)].sort((a, b) => rowRank(state, b) - rowRank(state, a));
    return ordered.reduce(closeTab, state);
}

function closeTab(state: DesktopTabsState, tabId: string): DesktopTabsState {
    const pane = paneOfTab(state, tabId);
    const tab = state.tabs[tabId];
    if (!(pane && tab)) {
        return state;
    }
    const index = state[pane]?.tabIds.indexOf(tabId) ?? 0;
    const { [tabId]: _closed, ...tabs } = state.tabs;
    // Recorded before the removal, so a left pane closing with it marks it `closedPrimary`.
    const closed = [...state.closed, { index, pane, tab }].slice(-closedTabLimit);
    return { ...removeTab({ ...state, closed }, tabId), tabs };
}

/** The newest closed tab returns to its pane (reopening the second pane if it closed) at its index, selected. */
export function reopenClosedTab(state: DesktopTabsState): DesktopTabsState {
    const entry = state.closed.at(-1);
    if (!entry) {
        return state;
    }
    const closed = state.closed.slice(0, -1);
    // Ids are unique per window, but never let a reopen clobber a live tab.
    if (state.tabs[entry.tab.id]) {
        return { ...state, closed };
    }
    const restored = { ...state, closed, tabs: { ...state.tabs, [entry.tab.id]: entry.tab } };
    const placed =
        entry.pane === 'closedPrimary'
            ? reopenLeftPane(restored, entry.tab.id, entry.index)
            : insertTab(restored, entry.pane, entry.tab.id, entry.index);
    return selectTab(placed, entry.tab.id, { focus: true });
}

/**
 * A tab whose left pane has since closed brings that pane back, pushing the
 * one pane to the right; its other closed tabs then name it again. With two
 * panes already open, it joins the left one at its index.
 */
function reopenLeftPane(state: DesktopTabsState, tabId: string, index: number): DesktopTabsState {
    if (!state.primary || state.secondary) {
        return insertTab(state, 'primary', tabId, index);
    }
    return {
        ...state,
        closed: state.closed.map((entry) => ({ ...entry, pane: splitPane(entry.pane) })),
        primary: { selectedTabId: tabId, tabIds: [tabId] },
        secondary: state.primary,
    };
}

function splitPane(pane: ClosedDesktopTab['pane']): ClosedDesktopTab['pane'] {
    return pane === 'closedPrimary' ? 'primary' : 'secondary';
}

/** Primary row first, then secondary, left to right. */
function rowRank(state: DesktopTabsState, tabId: string): number {
    return allTabIds(state).indexOf(tabId);
}
