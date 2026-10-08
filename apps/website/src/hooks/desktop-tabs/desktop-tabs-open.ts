import { navigateHistory, newTab, sameLocation } from './desktop-tabs-history.ts';
import {
    allTabIds,
    currentLocation,
    type DesktopTabsState,
    type PaneSide,
    pagePlacement,
    paneOfTab,
    shownTabIds,
    type TabLocation,
    tabPageKey,
} from './desktop-tabs-model.ts';
import {
    focusedTabId,
    insertAfter,
    insertTab,
    otherPane,
    putTab,
    selectTab,
} from './desktop-tabs-panes.ts';
import type { FocusedPaneOpenIntent, TabOpenIntent } from './tab-navigation.ts';

/**
 * Two panes: a plain in-page link to a place goes to the OTHER pane (the reading
 * pane stays put). Set false to have links act on their own pane like the sidebar.
 * Agent, Settings, and Thread links follow `pagePlacement` instead.
 */
export const inPageLinksUseOtherPane = true;

/**
 * ADR 0039 placement for a link inside a page. Ids arrive on the action: `newId` names a
 * new tab when one opens and the new history entry's key otherwise (they never collide:
 * each dispatch gets a fresh id).
 */
export function openLink(
    state: DesktopTabsState,
    input: { fromTabId: string; intent: TabOpenIntent; location: TabLocation; newId: string }
): DesktopTabsState {
    const { fromTabId, intent, location, newId } = input;
    const fromPane = paneOfTab(state, fromTabId);
    if (!fromPane) {
        return state;
    }
    const split = state.secondary !== null;
    // Web locations always open a new tab: the other pane when there are two, beside the source
    // otherwise, after that pane's current tab by the opener rule. Selected unless the gesture
    // asks for the background (Chrome: ⌘- or middle-click).
    if (location.kind === 'browser') {
        const opener = split ? state[otherPane(fromPane)]?.selectedTabId : fromTabId;
        const created = putTab(state, newTab(newId, location, newId));
        const placed = opener
            ? insertFromOpener(created, opener, newId)
            : appendToPane(state, otherPane(fromPane), location, newId);
        return intent === 'backgroundTab' ? placed : selectTab(placed, newId, { focus: false });
    }
    // A new-tab gesture: a tab after the source by the opener rule, in the background for
    // Command- or middle-click, selected when Shift is held (Chrome's dispositions).
    if (intent === 'newTab' || intent === 'backgroundTab') {
        const placed = insertFromOpener(
            putTab(state, newTab(newId, location, newId)),
            fromTabId,
            newId
        );
        return intent === 'backgroundTab' ? placed : selectTab(placed, newId, { focus: true });
    }
    if (intent === 'here') {
        return navigateTab(state, fromTabId, location, 'push', newId);
    }
    if (!(split && inPageLinksUseOtherPane) || pagePlacement(location) !== 'place') {
        return goToPlace(state, {
            candidates: placeCandidates(state),
            location,
            newId,
            tabId: fromTabId,
        });
    }
    const pane = otherPane(fromPane);
    const row = state[pane];
    if (!row) {
        return state;
    }
    return goToPlace(state, {
        candidates: row.tabIds,
        focus: false,
        location,
        newId,
        tabId: row.selectedTabId,
    });
}

/**
 * Sidebar, command menu, ⌘T: a place (`current`, see `reveal`), a new tab after the current
 * one by the opener rule (`backgroundTab` for Command- or middle-click and the row menu's
 * Open in new tab, `newTab` selected for Shift), or a new selected tab at the end of the row
 * (`newTabAtEnd`, Chrome's ⌘T and plus).
 */
export function openInFocusedPane(
    state: DesktopTabsState,
    input: { intent: FocusedPaneOpenIntent; location: TabLocation; newId: string }
): DesktopTabsState {
    const { intent, location, newId } = input;
    if (intent === 'current') {
        return reveal(state, { location, newId });
    }
    const current = focusedTabId(state);
    if (!current) {
        return selectTab(appendToPane(state, 'primary', location, newId), newId, { focus: true });
    }
    const created = putTab(state, newTab(newId, location, newId));
    if (intent === 'newTabAtEnd') {
        const pane = paneOfTab(state, current) ?? state.focusedPane;
        const end = state[pane]?.tabIds.length ?? 0;
        return selectTab(insertTab(created, pane, newId, end), newId, { focus: true });
    }
    const placed = insertFromOpener(created, current, newId);
    return intent === 'backgroundTab' ? placed : selectTab(placed, newId, { focus: true });
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

/** Sidebar, command menu, ⌘,, notification, deep link: a place from the focused pane. */
export function reveal(
    state: DesktopTabsState,
    input: { location: TabLocation; newId: string }
): DesktopTabsState {
    const current = focusedTabId(state);
    if (!current) {
        return selectTab(appendToPane(state, 'primary', input.location, input.newId), input.newId, {
            focus: true,
        });
    }
    return goToPlace(state, { ...input, candidates: placeCandidates(state), tabId: current });
}

/**
 * The one place rule (ADR 0039), from `tabId`:
 * 1. a tab among `candidates` already on that page is selected, pushing the address only
 *    when it drills in further;
 * 2. else an Agent profile or Settings opens as a new selected tab after `tabId`, and a
 *    Thread as a new selected tab in the right pane (`pagePlacement`);
 * 3. else `tabId` navigates (push) when it shows an app page or a new tab page;
 * 4. else (a web page) the place opens as a new selected tab right after it, so a page
 *    you are reading is never replaced by a place.
 */
function goToPlace(
    state: DesktopTabsState,
    input: {
        candidates: readonly string[];
        focus?: boolean;
        location: TabLocation;
        newId: string;
        tabId: string;
    }
): DesktopTabsState {
    const { candidates, focus = true, location, newId, tabId } = input;
    const existing = candidates.find((id) => samePage(state, id, location));
    if (existing) {
        return selectTab(navigateTab(state, existing, location, 'push', newId), existing, {
            focus,
        });
    }
    const tab = state.tabs[tabId];
    if (!tab) {
        return state;
    }
    const placement = pagePlacement(location);
    if (placement === 'sidePane') {
        return openInSidePane(state, location, newId);
    }
    // A blank new tab page becomes the page instead of being left behind.
    if (placement === 'newTab' && currentLocation(tab).kind !== 'newTab') {
        const created = putTab(state, newTab(newId, location, newId));
        return selectTab(insertFromOpener(created, tabId, newId), newId, { focus });
    }
    if (currentLocation(tab).kind !== 'browser') {
        return selectTab(navigateTab(state, tabId, location, 'push', newId), tabId, { focus });
    }
    const created = putTab(state, newTab(newId, location, newId));
    return selectTab(insertAfter(created, tabId, newId), newId, { focus });
}

/** Shown tabs first, then the focused pane's, then any. */
function placeCandidates(state: DesktopTabsState): string[] {
    const focused = state[state.focusedPane]?.tabIds ?? [];
    return [...new Set([...shownTabIds(state), ...focused, ...allTabIds(state)])];
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

/**
 * A plain Thread open: a selected tab after the right pane's shown tab, creating that pane in a
 * one-pane window. New-tab gestures skip this and open beside the source like any page.
 */
function openInSidePane(
    state: DesktopTabsState,
    location: TabLocation,
    newId: string
): DesktopTabsState {
    return selectTab(appendToPane(state, 'secondary', location, newId), newId, { focus: true });
}

function appendToPane(
    state: DesktopTabsState,
    pane: PaneSide,
    location: TabLocation,
    tabId: string
): DesktopTabsState {
    const row = state[pane];
    const index = row ? row.tabIds.indexOf(row.selectedTabId) + 1 : 0;
    return insertTab(putTab(state, newTab(tabId, location, tabId)), pane, tabId, index);
}

function samePage(state: DesktopTabsState, tabId: string, location: TabLocation) {
    const tab = state.tabs[tabId];
    return tab !== undefined && tabPageKey(currentLocation(tab)) === tabPageKey(location);
}
