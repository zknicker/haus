import {
    type DesktopTabsState,
    type PaneSide,
    type PaneState,
    paneOfTab,
} from './desktop-tabs-model.ts';

/**
 * Chrome's tab multi-selection (`TabStripModel` + `ListSelectionModel`), per
 * pane row. A row always has its shown tab selected; Command-click toggles a
 * tab, Shift-click selects the range from the anchor, Shift-Command-click adds
 * that range. Only one pane holds a multi-selection at a time: a selection
 * gesture in one row collapses the other's, and any plain activation collapses
 * both (Chrome's `ActivateTabAt`).
 */
export type SelectionGesture = 'addRange' | 'range' | 'toggle';

/** A row's selected tabs, in row order: the shown tab alone, or its multi-selection. */
export function rowSelection(row: PaneState): readonly string[] {
    return row.selection?.tabIds ?? [row.selectedTabId];
}

/** The selected tabs of `tabId`'s row when it is one of them, else just `tabId` (Chrome's `GetIndicesForCommand`). */
export function selectionFor(state: DesktopTabsState, tabId: string): readonly string[] {
    const pane = paneOfTab(state, tabId);
    const row = pane ? state[pane] : null;
    const selected = row ? rowSelection(row) : [];
    return selected.includes(tabId) ? selected : [tabId];
}

/** The focused pane's selected tabs: what ⌘W closes. */
export function focusedSelection(state: DesktopTabsState): readonly string[] {
    const row = state[state.focusedPane] ?? state.primary;
    return row ? rowSelection(row) : [];
}

export function isTabSelected(state: DesktopTabsState, tabId: string): boolean {
    const pane = paneOfTab(state, tabId);
    const row = pane ? state[pane] : null;
    return row ? rowSelection(row).includes(tabId) : false;
}

/** A Command- or Shift-click on `tabId`: its row's selection changes and its pane takes focus. */
export function extendSelection(
    state: DesktopTabsState,
    tabId: string,
    gesture: SelectionGesture
): DesktopTabsState {
    const pane = paneOfTab(state, tabId);
    const row = pane ? state[pane] : null;
    if (!(pane && row)) {
        return state;
    }
    const selected = rowSelection(row);
    const anchor = row.selection?.anchorTabId ?? row.selectedTabId;
    let next: PaneState;
    if (gesture === 'toggle') {
        next = toggled(row, selected, anchor, tabId);
    } else {
        const range = rangeOf(row.tabIds, anchor, tabId);
        const ids = gesture === 'range' ? range : [...selected, ...range];
        // Chrome: the clicked tab becomes active; the anchor stays put.
        next = withSelection(row, ids, tabId, anchor);
    }
    const other = pane === 'primary' ? 'secondary' : 'primary';
    return {
        ...state,
        [other]: collapsed(state[other]),
        [pane]: next,
        focusedPane: pane,
    };
}

/**
 * Tabs that just moved together (a drag, a pane move, an arrival from another
 * window) stay selected together in their new row, `active` shown, and that
 * pane takes focus; the other pane's multi-selection collapses.
 */
export function selectMoved(
    state: DesktopTabsState,
    ids: readonly string[],
    active: string,
    anchor: string
): DesktopTabsState {
    const pane = paneOfTab(state, active);
    const row = pane ? state[pane] : null;
    if (!(pane && row)) {
        return state;
    }
    const other = pane === 'primary' ? 'secondary' : 'primary';
    return {
        ...state,
        [other]: collapsed(state[other]),
        [pane]: withSelection(row, ids, active, anchor),
        focusedPane: pane,
    };
}

/**
 * `row` showing `active` with `ids` selected (row order, deduplicated). A
 * selection of one drops back to the shown tab alone; an anchor that is not
 * selected falls to `active`.
 */
export function withSelection(
    row: PaneState,
    ids: readonly string[],
    active: string,
    anchor: string
): PaneState {
    const chosen = new Set([...ids, active]);
    const tabIds = row.tabIds.filter((id) => chosen.has(id));
    const { selection: _dropped, ...rest } = row;
    if (tabIds.length < 2) {
        return { ...rest, selectedTabId: active };
    }
    return {
        ...rest,
        selectedTabId: active,
        selection: { anchorTabId: tabIds.includes(anchor) ? anchor : active, tabIds },
    };
}

/** The row without its multi-selection (the shown tab alone selected). */
export function collapsed(row: PaneState | null): PaneState | null {
    if (!row?.selection) {
        return row;
    }
    const { selection: _dropped, ...rest } = row;
    return rest;
}

/** After tabs leave a row: its selection keeps only tabs still there and still includes the shown one. */
export function prunedSelection(row: PaneState): PaneState {
    if (!row.selection) {
        return row;
    }
    const kept = row.selection.tabIds.filter((id) => row.tabIds.includes(id));
    if (!kept.includes(row.selectedTabId)) {
        return collapsed(row) ?? row;
    }
    return withSelection(row, kept, row.selectedTabId, row.selection.anchorTabId);
}

/** Every pane collapsed to its shown tab. */
export function collapseSelections(state: DesktopTabsState): DesktopTabsState {
    const primary = collapsed(state.primary);
    const secondary = collapsed(state.secondary);
    return primary === state.primary && secondary === state.secondary
        ? state
        : { ...state, primary, secondary };
}

export function paneSelection(state: DesktopTabsState, pane: PaneSide): readonly string[] {
    const row = state[pane];
    return row ? rowSelection(row) : [];
}

/**
 * Chrome's `ToggleSelected`: an unselected tab joins and becomes active and
 * the anchor; a selected one leaves unless it is the last, and if it was
 * active or the anchor, the first selected tab takes that role.
 */
function toggled(
    row: PaneState,
    selected: readonly string[],
    anchor: string,
    tabId: string
): PaneState {
    if (!selected.includes(tabId)) {
        return withSelection(row, [...selected, tabId], tabId, tabId);
    }
    const rest = selected.filter((id) => id !== tabId);
    const first = rest[0];
    if (!first) {
        return row;
    }
    const active = row.selectedTabId === tabId ? first : row.selectedTabId;
    return withSelection(row, rest, active, anchor === tabId ? first : anchor);
}

function rangeOf(row: readonly string[], from: string, to: string): string[] {
    const a = row.indexOf(from);
    const b = row.indexOf(to);
    if (a < 0 || b < 0) {
        return [to];
    }
    return row.slice(Math.min(a, b), Math.max(a, b) + 1);
}
