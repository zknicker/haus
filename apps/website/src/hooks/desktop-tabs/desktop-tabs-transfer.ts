import {
    type DesktopTabsState,
    type PaneSide,
    paneOfTab,
    type TabBundle,
} from './desktop-tabs-model.ts';
import { insertTab, removeTab } from './desktop-tabs-panes.ts';
import { selectMoved } from './desktop-tabs-selection.ts';

/**
 * Tabs moving between windows (ADR 0039 tear-off and cross-window drag). A
 * dragged multi-selection travels as one `TabBundle`; each tab carries its
 * whole record, history included, and is never a closed tab: Reopen Closed
 * Tab does not see it leave.
 */

/**
 * Tabs arriving from another window land side by side at `to`, in order,
 * selected together with the bundle's active tab shown. Ids already here are
 * ignored.
 */
export function adoptTabs(
    state: DesktopTabsState,
    bundle: TabBundle,
    to: { index: number; pane: PaneSide }
): DesktopTabsState {
    const arriving = bundle.tabs.filter((tab) => !state.tabs[tab.id]);
    const first = arriving[0];
    if (!first) {
        return state;
    }
    const tabs = { ...state.tabs, ...Object.fromEntries(arriving.map((tab) => [tab.id, tab])) };
    const ids = arriving.map((tab) => tab.id);
    const placed = placeTogether({ ...state, tabs }, to, ids);
    const active = ids.includes(bundle.activeTabId) ? bundle.activeTabId : first.id;
    return selectMoved(placed, ids, active, active);
}

/** Inserts `tabIds` side by side at `to` (the pane is created when absent); selection untouched. */
export function placeTogether(
    state: DesktopTabsState,
    to: { index: number; pane: PaneSide },
    tabIds: readonly string[]
): DesktopTabsState {
    const [first, ...rest] = tabIds;
    if (!first) {
        return state;
    }
    const placed = insertTab(state, to.pane, first, to.index);
    // `insertTab` may fall back to the primary row; the rest follow the first.
    const pane = paneOfTab(placed, first) ?? 'primary';
    const at = placed[pane]?.tabIds.indexOf(first) ?? 0;
    return rest.reduce<DesktopTabsState>(
        (current, tabId, offset) => insertTab(current, pane, tabId, at + 1 + offset),
        placed
    );
}

/** Tabs leaving for another window: out of their rows and records, with no closed entries. */
export function releaseTabs(state: DesktopTabsState, tabIds: readonly string[]): DesktopTabsState {
    return tabIds.reduce<DesktopTabsState>((current, tabId) => {
        if (!current.tabs[tabId]) {
            return current;
        }
        const { [tabId]: _moved, ...tabs } = current.tabs;
        return { ...removeTab(current, tabId), tabs };
    }, state);
}

/** A window torn off with a bundle: one pane holding its tabs, selected together. */
export function windowOfTabs(bundle: TabBundle): DesktopTabsState {
    const ids = bundle.tabs.map((tab) => tab.id);
    const active = ids.includes(bundle.activeTabId) ? bundle.activeTabId : (ids[0] ?? '');
    const state: DesktopTabsState = {
        closed: [],
        focusedPane: 'primary',
        mru: [active],
        primary: { selectedTabId: active, tabIds: ids },
        secondary: null,
        tabs: Object.fromEntries(bundle.tabs.map((tab) => [tab.id, tab])),
    };
    return selectMoved(state, ids, active, active);
}

/** The bundle a drag of `tabIds` carries: their records in row order, showing the row's shown tab when it is among them. */
export function bundleOf(state: DesktopTabsState, tabIds: readonly string[]): TabBundle | null {
    const tabs = tabIds.flatMap((id) => {
        const tab = state.tabs[id];
        return tab ? [tab] : [];
    });
    const first = tabs[0];
    if (!first) {
        return null;
    }
    const pane = paneOfTab(state, first.id);
    const shown = pane ? state[pane]?.selectedTabId : undefined;
    const ids = tabs.map((tab) => tab.id);
    return { activeTabId: shown && ids.includes(shown) ? shown : first.id, tabs };
}
