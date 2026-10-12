import { navigateHistory, newTab, sameLocation } from './desktop-tabs-history.ts';
import {
    allTabIds,
    currentLocation,
    type DesktopTabsState,
    paneOfTab,
    type TabLocation,
    tabPageKey,
} from './desktop-tabs-model.ts';
import { focusedTabId, insertAfter, insertTab, putTab, selectTab } from './desktop-tabs-panes.ts';

/**
 * The desktop navigation verbs (ADR 0039): the surface you click decides which.
 *
 * - `goTo`: the sidebar and the command menu. The left pane's selected tab navigates (push).
 * - `openPage`: anything activated inside a page, notifications, deep links, ⌘F. A selected tab
 *   in the right pane.
 * - `openTabFrom`: a modified click (⌘, middle, Shift). A tab right after the source.
 * - `openSettings`: ⌘, and the Settings button. The window's one Settings tab.
 *
 * Ids arrive on the action (`newId`): a new tab's id, or the new history entry's key.
 */

/** Go: the left pane's selected tab pushes `location` and its pane takes focus. Never dedupes. */
export function goTo(
    state: DesktopTabsState,
    input: { location: TabLocation; newId: string }
): DesktopTabsState {
    const tabId = state.primary?.selectedTabId;
    if (!tabId) {
        return appendSelected(state, 'primary', input.location, input.newId);
    }
    return selectTab(navigateTab(state, tabId, input.location, 'push', input.newId), tabId, {
        focus: true,
    });
}

/**
 * Open: a right-pane tab already on that page is selected (pushing a deeper address onto it);
 * else a new selected tab in the right pane, created in a one-pane window. It lands after the
 * source when the source is in the right pane (stacking there), else after the right pane's
 * selected tab, so consecutive opens keep their order. The right pane takes focus.
 */
export function openPage(
    state: DesktopTabsState,
    input: { fromTabId: string | null; location: TabLocation; newId: string }
): DesktopTabsState {
    const { fromTabId, location, newId } = input;
    const right = state.secondary;
    if (!right) {
        if (!state.primary) {
            return appendSelected(state, 'primary', location, newId);
        }
        return appendSelected(state, 'secondary', location, newId);
    }
    // Prefer the shown tab when duplicates match, so reopening never switches away from it.
    const existing = samePage(state, right.selectedTabId, location)
        ? right.selectedTabId
        : right.tabIds.find((id) => samePage(state, id, location));
    if (existing) {
        return selectTab(navigateTab(state, existing, location, 'push', newId), existing, {
            focus: true,
        });
    }
    const after =
        fromTabId && paneOfTab(state, fromTabId) === 'secondary' ? fromTabId : right.selectedTabId;
    const created = putTab(state, newTab(newId, location, newId));
    return selectTab(insertAfter(created, after, newId), newId, { focus: true });
}

/**
 * A modified click: a new tab right after `fromTabId` in its pane (the left pane's selected tab
 * when null: the sidebar and the command menu), by the opener rule. Background for ⌘- or
 * middle-click, selected (its pane focused) with Shift. Never dedupes.
 */
export function openTabFrom(
    state: DesktopTabsState,
    input: { background: boolean; fromTabId: string | null; location: TabLocation; newId: string }
): DesktopTabsState {
    const { background, location, newId } = input;
    const source =
        input.fromTabId && paneOfTab(state, input.fromTabId)
            ? input.fromTabId
            : state.primary?.selectedTabId;
    if (!source) {
        return appendSelected(state, 'primary', location, newId);
    }
    const placed = insertFromOpener(putTab(state, newTab(newId, location, newId)), source, newId);
    return background ? placed : selectTab(placed, newId, { focus: true });
}

/**
 * Settings is a singleton: an existing Settings tab anywhere is selected (its pane focused),
 * taking `location` when that is not an ancestor of the address it shows; else Settings opens
 * as a new selected tab in the left pane after its selected tab.
 */
export function openSettings(
    state: DesktopTabsState,
    input: { location: TabLocation; newId: string }
): DesktopTabsState {
    const { location, newId } = input;
    const existing = allTabIds(state).find((id) => samePage(state, id, location));
    if (existing) {
        const tab = state.tabs[existing];
        const shown = tab ? currentLocation(tab) : null;
        const within =
            shown?.kind === 'app' &&
            location.kind === 'app' &&
            shown.path.startsWith(location.path);
        const navigated = within ? state : navigateTab(state, existing, location, 'push', newId);
        return selectTab(navigated, existing, { focus: true });
    }
    const left = state.primary?.selectedTabId;
    if (!left) {
        return appendSelected(state, 'primary', location, newId);
    }
    const created = putTab(state, newTab(newId, location, newId));
    return selectTab(insertAfter(created, left, newId), newId, { focus: true });
}

/** ⌘T and the row's plus: a new selected tab at the end of the focused pane's row. */
export function openNewTabAtEnd(
    state: DesktopTabsState,
    input: { location: TabLocation; newId: string }
): DesktopTabsState {
    const current = focusedTabId(state);
    const pane = (current && paneOfTab(state, current)) || 'primary';
    const end = state[pane]?.tabIds.length ?? 0;
    const created = putTab(state, newTab(input.newId, input.location, input.newId));
    return selectTab(insertTab(created, pane, input.newId, end), input.newId, { focus: true });
}

/**
 * Chrome's opener rule (`TabStripModel::DetermineInsertionIndex`): a tab opened from
 * `openerTabId` lands right after it, or after the tab last opened from it while the run
 * lasts, so successive opens keep their order (opener, A, B, C). `tabId` is already in
 * `state.tabs`.
 */
export function insertFromOpener(
    state: DesktopTabsState,
    openerTabId: string,
    tabId: string
): DesktopTabsState {
    const run = state.openerRun;
    const pane = paneOfTab(state, openerTabId);
    const after =
        run?.openerTabId === openerTabId && pane && paneOfTab(state, run.lastOpenedTabId) === pane
            ? run.lastOpenedTabId
            : openerTabId;
    return {
        ...insertAfter(state, after, tabId),
        openerRun: { lastOpenedTabId: tabId, openerTabId },
    };
}

/** Push or replace inside one tab; a push to the address it already shows is a no-op. */
export function navigateTab(
    state: DesktopTabsState,
    tabId: string,
    location: TabLocation,
    mode: 'push' | 'replace',
    entryKey: string
): DesktopTabsState {
    const tab = state.tabs[tabId];
    if (!tab || (mode === 'push' && sameLocation(currentLocation(tab), location))) {
        return state;
    }
    return putTab(state, {
        ...tab,
        history: navigateHistory(tab.history, location, mode, entryKey),
    });
}

/** A new selected tab after `pane`'s selected tab (the pane created when absent), focused. */
function appendSelected(
    state: DesktopTabsState,
    pane: 'primary' | 'secondary',
    location: TabLocation,
    tabId: string
): DesktopTabsState {
    const row = state[pane];
    const index = row ? row.tabIds.indexOf(row.selectedTabId) + 1 : 0;
    const placed = insertTab(putTab(state, newTab(tabId, location, tabId)), pane, tabId, index);
    return selectTab(placed, tabId, { focus: true });
}

function samePage(state: DesktopTabsState, tabId: string, location: TabLocation) {
    const tab = state.tabs[tabId];
    return tab !== undefined && tabPageKey(currentLocation(tab)) === tabPageKey(location);
}
