import { closeTabs, reopenClosedTab } from './desktop-tabs-closed.ts';
import { duplicateTabs, openTabAfter } from './desktop-tabs-commands.ts';
import { goHistory, savePageStateInHistory } from './desktop-tabs-history.ts';
import type {
    DesktopTabsState,
    PaneSide,
    TabBundle,
    TabLocation,
    TabPageState,
} from './desktop-tabs-model.ts';
import { moveTabs } from './desktop-tabs-move.ts';
import { navigateTab, openInFocusedPane, openLink, reveal } from './desktop-tabs-open.ts';
import { putTab, selectTab, syncMru } from './desktop-tabs-panes.ts';
import { extendSelection, type SelectionGesture } from './desktop-tabs-selection.ts';
import { adoptTabs, releaseTabs } from './desktop-tabs-transfer.ts';
import type { FocusedPaneOpenIntent, TabOpenIntent } from './tab-navigation.ts';

/**
 * Every change to a window's tabs. Ids and entry keys come in on the action
 * (`newId`) so the reducer stays pure and testable.
 *
 * SEAM: the union is the contract; other slices dispatch through
 * `DesktopTabsApi`, never this union directly.
 */
export type DesktopTabsAction =
    /** In-tab navigation: a page's own push/replace (drill-down, redirect, search params). */
    | {
          kind: 'navigate';
          location: TabLocation;
          mode: 'push' | 'replace';
          newId: string;
          tabId: string;
      }
    /** Back/forward inside a tab's history; out-of-range deltas are ignored. */
    | { kind: 'go'; delta: number; tabId: string }
    /**
     * A cross-page navigation from inside a tab, placed by the ADR 0039 rules:
     * `auto` with two panes → the other pane (selecting an existing tab with
     * the same page key there); `auto` with one pane → the current tab;
     * `newTab` → a new tab after `fromTabId` in its pane. Web locations always
     * open a new tab (in the other pane when there are two, else beside the
     * source). New tabs follow the opener rule (`insertFromOpener`). Links never
     * open the second pane.
     */
    | {
          kind: 'openLink';
          fromTabId: string;
          intent: TabOpenIntent;
          location: TabLocation;
          newId: string;
      }
    /** Sidebar / command menu / ⌘T target: the current tab of the focused pane, or a new tab there. */
    | {
          kind: 'openInFocusedPane';
          intent: FocusedPaneOpenIntent;
          location: TabLocation;
          newId: string;
      }
    /** The tab menu's New tab to the right: a new selected tab right after `afterTabId`. */
    | { afterTabId: string; kind: 'openAfter'; location: TabLocation; newId: string }
    /** Duplicate: copies with their history, right after the last of `tabIds`, selected together. */
    | { kind: 'duplicate'; newId: string; tabIds: readonly string[] }
    /** Notification and deep-link click: select a tab already showing the page, else navigate the focused pane's current tab. */
    | { kind: 'reveal'; location: TabLocation; newId: string }
    /** A plain click: shows the tab, collapsing any multi-selection. */
    | { kind: 'select'; tabId: string }
    /** Command- or Shift-click: Chrome's multi-selection rules (`desktop-tabs-selection.ts`). */
    | { gesture: SelectionGesture; kind: 'extendSelection'; tabId: string }
    | { kind: 'focusPane'; pane: PaneSide }
    /**
     * Each tab becomes its own closed tab. Closing a pane's last tab closes the
     * pane; the window's last tab leaves `primary: null`.
     */
    | { kind: 'close'; tabIds: readonly string[] }
    /** ⌘⇧T: the newest closed tab, with its history, back into its pane at its index. */
    | { kind: 'reopenClosed' }
    /**
     * Drag: reorder within a pane, move between panes, or (to `secondary` with
     * none) open the second pane. Several tabs move together, side by side.
     */
    | { kind: 'move'; tabIds: readonly string[]; to: { index: number; pane: PaneSide } }
    /** Cross-window drag: tabs from another window land here, selected together. */
    | { bundle: TabBundle; kind: 'adopt'; to: { index: number; pane: PaneSide } }
    /** Cross-window drag: tabs leave for another window; no closed-tab records. */
    | { kind: 'release'; tabIds: readonly string[] }
    | { kind: 'savePageState'; pageState: TabPageState; tabId: string };

export function desktopTabsReducer(
    state: DesktopTabsState,
    action: DesktopTabsAction
): DesktopTabsState {
    const next = endOpenerRun(reduce(state, action), action);
    return next === state ? state : syncMru(next);
}

/**
 * Opens and in-tab navigation keep the opener run going; anything that reorders or
 * selects tabs ends it, as Chrome forgets openers when the active tab changes.
 */
function endOpenerRun(state: DesktopTabsState, action: DesktopTabsAction): DesktopTabsState {
    if (!state.openerRun || openerRunActions.has(action.kind)) {
        return state;
    }
    const { openerRun: _ended, ...rest } = state;
    return rest;
}

const openerRunActions = new Set<DesktopTabsAction['kind']>([
    'focusPane',
    'go',
    'navigate',
    'openInFocusedPane',
    'openLink',
    'savePageState',
]);

/** A window's first state: one pane with one tab at `location`. */
export function initialDesktopTabs(
    location: TabLocation,
    ids: { entryKey: string; tabId: string }
): DesktopTabsState {
    return {
        closed: [],
        focusedPane: 'primary',
        mru: [ids.tabId],
        primary: { selectedTabId: ids.tabId, tabIds: [ids.tabId] },
        secondary: null,
        tabs: {
            [ids.tabId]: {
                history: { entries: [{ key: ids.entryKey, location, pageState: {} }], index: 0 },
                id: ids.tabId,
            },
        },
    };
}

function reduce(state: DesktopTabsState, action: DesktopTabsAction): DesktopTabsState {
    switch (action.kind) {
        case 'navigate':
            return navigateTab(state, action.tabId, action.location, action.mode, action.newId);
        case 'go':
            return goTab(state, action.tabId, action.delta);
        case 'openLink':
            return openLink(state, action);
        case 'openInFocusedPane':
            return openInFocusedPane(state, action);
        case 'reveal':
            return reveal(state, action);
        case 'openAfter':
            return openTabAfter(state, action);
        case 'duplicate':
            return duplicateTabs(state, action.tabIds, action.newId);
        case 'select':
            return selectTab(state, action.tabId, { focus: true });
        case 'extendSelection':
            return extendSelection(state, action.tabId, action.gesture);
        case 'focusPane':
            return focusPane(state, action.pane);
        case 'close':
            return closeTabs(state, action.tabIds);
        case 'reopenClosed':
            return reopenClosedTab(state);
        case 'move':
            return moveTabs(state, action.tabIds, action.to);
        case 'adopt':
            return adoptTabs(state, action.bundle, action.to);
        case 'release':
            return releaseTabs(state, action.tabIds);
        case 'savePageState': {
            const tab = state.tabs[action.tabId];
            return tab
                ? putTab(state, {
                      ...tab,
                      history: savePageStateInHistory(tab.history, action.pageState),
                  })
                : state;
        }
    }
}

function goTab(state: DesktopTabsState, tabId: string, delta: number) {
    const tab = state.tabs[tabId];
    const history = tab ? goHistory(tab.history, delta) : null;
    return tab && history ? putTab(state, { ...tab, history }) : state;
}

function focusPane(state: DesktopTabsState, pane: PaneSide): DesktopTabsState {
    return !state[pane] || state.focusedPane === pane ? state : { ...state, focusedPane: pane };
}
