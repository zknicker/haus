import { newTab } from './desktop-tabs-history.ts';
import {
    type DesktopTab,
    type DesktopTabsState,
    paneOfTab,
    type TabLocation,
} from './desktop-tabs-model.ts';
import { insertAfter, putTab, selectTab } from './desktop-tabs-panes.ts';
import { selectMoved } from './desktop-tabs-selection.ts';
import { placeTogether } from './desktop-tabs-transfer.ts';

/**
 * The tab menu's row commands (ADR 0039), Chrome's `TabStripModel` context
 * commands: New tab to the right, Duplicate, and Close tabs to the right.
 */

/** New tab to the right: a new selected tab right after `afterTabId`, its pane focused. */
export function openTabAfter(
    state: DesktopTabsState,
    input: { afterTabId: string; location: TabLocation; newId: string }
): DesktopTabsState {
    if (!paneOfTab(state, input.afterTabId)) {
        return state;
    }
    const created = putTab(state, newTab(input.newId, input.location, input.newId));
    return selectTab(insertAfter(created, input.afterTabId, input.newId), input.newId, {
        focus: true,
    });
}

/**
 * Duplicate: a copy of each tab, history included, lands as one block right
 * after the last of them, selected together, showing the copy of the shown
 * tab. A copy's web pages get fresh views that reopen at the same address.
 * Ids derive from `newId` so the reducer stays pure.
 */
export function duplicateTabs(
    state: DesktopTabsState,
    tabIds: readonly string[],
    newId: string
): DesktopTabsState {
    const pane = tabIds[0] ? paneOfTab(state, tabIds[0]) : null;
    const row = pane ? state[pane] : null;
    if (!(pane && row)) {
        return state;
    }
    const sources = row.tabIds.filter((id) => tabIds.includes(id));
    const last = sources.at(-1);
    if (!last) {
        return state;
    }
    const copies = sources.flatMap((id, index) => {
        const tab = state.tabs[id];
        return tab ? [copyTab(tab, `${newId}-${index}`)] : [];
    });
    const withCopies = copies.reduce(putTab, state);
    const at = row.tabIds.indexOf(last) + 1;
    const ids = copies.map((copy) => copy.id);
    const placed = placeTogether(withCopies, { index: at, pane }, ids);
    const shownIndex = sources.indexOf(row.selectedTabId);
    const active = ids[shownIndex] ?? ids[0] ?? '';
    return selectMoved(placed, ids, active, active);
}

/** Close tabs to the right: the row's tabs after the rightmost of `tabIds`. */
export function tabsToRight(state: DesktopTabsState, tabIds: readonly string[]): string[] {
    const pane = tabIds[0] ? paneOfTab(state, tabIds[0]) : null;
    const row = pane ? (state[pane]?.tabIds ?? []) : [];
    const last = Math.max(...tabIds.map((id) => row.indexOf(id)));
    return last < 0 ? [] : row.slice(last + 1);
}

/** A copy of `tab` named `tabId`: fresh entry keys, and fresh web views named per source view. */
function copyTab(tab: DesktopTab, tabId: string): DesktopTab {
    const views = new Map<string, string>();
    const entries = tab.history.entries.map((entry, index) => {
        const { location } = entry;
        if (location.kind !== 'browser') {
            return { ...entry, key: `${tabId}-${index}` };
        }
        const viewId = views.get(location.viewId) ?? `${tabId}-v${views.size}`;
        views.set(location.viewId, viewId);
        return { ...entry, key: `${tabId}-${index}`, location: { ...location, viewId } };
    });
    return { history: { entries, index: tab.history.index }, id: tabId };
}
