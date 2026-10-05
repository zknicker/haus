import {
    allTabIds,
    type ClosedDesktopTab,
    type DesktopTab,
    type DesktopTabsState,
    type PaneSide,
    type PaneState,
    paneOfTab,
    shownTabIds,
} from './desktop-tabs-model.ts';
import { collapseSelections, prunedSelection } from './desktop-tabs-selection.ts';

/**
 * Pane and selection rules shared by the reducer cases: insert into a row
 * (opening the second pane), select, remove (collapsing an empty pane and
 * promoting the secondary), and MRU upkeep.
 */
export function otherPane(pane: PaneSide): PaneSide {
    return pane === 'primary' ? 'secondary' : 'primary';
}

/** The focused pane's current tab. */
export function focusedTabId(state: DesktopTabsState): string | null {
    return state[state.focusedPane]?.selectedTabId ?? state.primary?.selectedTabId ?? null;
}

export function putTab(state: DesktopTabsState, tab: DesktopTab): DesktopTabsState {
    return { ...state, tabs: { ...state.tabs, [tab.id]: tab } };
}

/** Inserts `tabId` at `index` (clamped) in `pane`, creating the pane when absent. Selection is untouched unless the pane is new. */
export function insertTab(
    state: DesktopTabsState,
    pane: PaneSide,
    tabId: string,
    index: number
): DesktopTabsState {
    // A secondary row cannot exist without a primary one.
    const side = pane === 'secondary' && !state.primary ? 'primary' : pane;
    const row = state[side];
    if (!row) {
        return { ...state, [side]: { selectedTabId: tabId, tabIds: [tabId] } };
    }
    const at = Math.max(0, Math.min(index, row.tabIds.length));
    const tabIds = [...row.tabIds.slice(0, at), tabId, ...row.tabIds.slice(at)];
    return { ...state, [side]: { ...row, tabIds } };
}

/** Inserts right after `afterTabId` in its pane. */
export function insertAfter(state: DesktopTabsState, afterTabId: string, tabId: string) {
    const pane = paneOfTab(state, afterTabId) ?? 'primary';
    const index = (state[pane]?.tabIds.indexOf(afterTabId) ?? -1) + 1;
    return insertTab(state, pane, tabId, index);
}

/**
 * Shows `tabId` in its pane; `focus` also makes its pane the focused one.
 * Like Chrome's `ActivateTabAt`, it collapses every multi-selection.
 */
export function selectTab(
    state: DesktopTabsState,
    tabId: string,
    { focus }: { focus: boolean }
): DesktopTabsState {
    const pane = paneOfTab(state, tabId);
    const single = collapseSelections(state);
    const row = pane ? single[pane] : null;
    if (!(pane && row)) {
        return state;
    }
    return {
        ...single,
        [pane]: row.selectedTabId === tabId ? row : { ...row, selectedTabId: tabId },
        focusedPane: focus ? pane : state.focusedPane,
    };
}

/**
 * Takes `tabId` out of its row (the record stays). A removed shown tab falls
 * to its right neighbor, else its left, and the row's multi-selection keeps
 * what remains (dropping it when the shown tab was not in it); an emptied pane closes, the secondary
 * becoming the primary (closed tabs follow, `ClosedDesktopTab`); the window's last tab leaves
 * `primary: null`.
 */
export function removeTab(state: DesktopTabsState, tabId: string): DesktopTabsState {
    const pane = paneOfTab(state, tabId);
    const row = pane ? state[pane] : null;
    if (!(pane && row)) {
        return state;
    }
    const remaining = row.tabIds.filter((id) => id !== tabId);
    const nextRow: PaneState | null =
        remaining.length === 0
            ? null
            : prunedSelection({
                  ...row,
                  selectedTabId:
                      row.selectedTabId === tabId
                          ? (neighbor(row.tabIds, tabId) ?? remaining[0] ?? '')
                          : row.selectedTabId,
                  tabIds: remaining,
              });
    let next: DesktopTabsState = { ...state, [pane]: nextRow };
    if (!next.primary && next.secondary) {
        next = {
            ...next,
            closed: next.closed.map((entry) => ({ ...entry, pane: promotedPane(entry.pane) })),
            primary: next.secondary,
            secondary: null,
        };
    }
    if (!next[next.focusedPane]) {
        next = { ...next, focusedPane: 'primary' };
    }
    return next;
}

/**
 * Shown tabs first, then the rest by recency; drops closed ids and appends
 * tabs never shown. Returns `state` itself when nothing changed.
 */
export function syncMru(state: DesktopTabsState): DesktopTabsState {
    const live = new Set(allTabIds(state));
    const mru = [...new Set([...shownTabIds(state), ...state.mru, ...live])].filter((id) =>
        live.has(id)
    );
    const same =
        mru.length === state.mru.length && mru.every((id, index) => state.mru[index] === id);
    return same ? state : { ...state, mru };
}

/** The left pane closed and the right one became the primary: closed tabs follow their panes. */
function promotedPane(pane: ClosedDesktopTab['pane']): ClosedDesktopTab['pane'] {
    return pane === 'secondary' ? 'primary' : 'closedPrimary';
}

function neighbor(row: readonly string[], tabId: string): string | null {
    const index = row.indexOf(tabId);
    return row[index + 1] ?? row[index - 1] ?? null;
}
