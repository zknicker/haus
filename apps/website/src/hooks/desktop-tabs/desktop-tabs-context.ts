import * as React from 'react';
import type {
    DesktopTab,
    DesktopTabsState,
    PaneSide,
    TabBundle,
    TabLocation,
    TabPageState,
} from './desktop-tabs-model.ts';
import type { SelectionGesture } from './desktop-tabs-selection.ts';
import type { FocusedPaneOpenIntent, TabOpenIntent } from './tab-navigation.ts';

/**
 * The one desktop tabs surface every consumer reads (ADR 0039). Slice A's
 * controller (`useDesktopTabsController`) owns the reducer, persistence,
 * closed tabs, and the window-close-on-empty effect and provides this value.
 * Strip and pane UI, per-tab routers, the sidebar's shell router, shortcuts,
 * and the browser-view layout consume it.
 *
 * SEAM: add members here first, then implement; consumers never reach into
 * the reducer.
 */
export interface DesktopTabsApi {
    /** Tabs dragged in from another window land side by side at `to`, selected together. */
    adopt: (bundle: TabBundle, to: { index: number; pane: PaneSide }) => void;
    /**
     * Closes `tabIds`, each its own closed tab; omitted (⌘W), the focused
     * pane's selected tabs. Closing the window's last tab closes the window.
     */
    close: (tabIds?: readonly string[]) => void;
    /** The tab menu's Duplicate: copies with their history, right after the last of `tabIds`. */
    duplicate: (tabIds: readonly string[]) => void;
    /** Command- or Shift-click on a tab: Chrome's multi-selection rules. */
    extendSelection: (tabId: string, gesture: SelectionGesture) => void;
    focusPane: (pane: PaneSide) => void;
    /** ⌘[ / ⌘]: history in the focused pane's current tab. */
    go: (tabId: string, delta: number) => void;
    /** Tabs whose React tree stays mounted (shown + most recent hidden, up to `mountedTabLimit`). */
    mountedTabIds: readonly string[];
    /** Several tabs move together, side by side in row order. */
    move: (tabIds: readonly string[], to: { index: number; pane: PaneSide }) => void;
    /**
     * Move to new window: `tabIds` leave for a new window, live pages and history
     * intact, like a tear-off; no closed-tab records. No-op when they are the window's every tab.
     */
    moveToNewWindow: (tabIds: readonly string[]) => void;
    navigate: (tabId: string, location: TabLocation, mode: 'push' | 'replace') => void;
    /** The tab menu's New tab to the right: a new selected tab right after `tabId`. */
    openAfter: (tabId: string, location: TabLocation) => void;
    /** Sidebar, command menu, ⌘T, ⌘,: a place from the focused pane (`current`), or a new tab there. */
    openInFocusedPane: (location: TabLocation, intent: FocusedPaneOpenIntent) => void;
    /** A cross-page link from inside `fromTabId`, placed by the ADR 0039 rules. */
    openLink: (fromTabId: string, location: TabLocation, intent: TabOpenIntent) => void;
    /** Tabs dragged out to another window leave, without closed-tab records. */
    release: (tabIds: readonly string[]) => void;
    /** ⌘⇧T. */
    reopenClosed: () => void;
    /** Notification, deep link, menu Settings…: the place rule from the focused pane (ADR 0039). */
    reveal: (location: TabLocation) => void;
    savePageState: (tabId: string, pageState: TabPageState) => void;
    /** A plain click: shows the tab, collapsing any multi-selection. */
    select: (tabId: string) => void;
    /** ⌘1–9 and Control-Tab act on the focused pane's row. */
    selectInFocusedPane: (target: { index: number } | { step: 1 | -1 }) => void;
    /** The Server these tabs belong to; tabs move only between windows on the same Server. */
    serverId: string;
    /** Tabs on screen: one per pane. */
    shownTabIds: readonly string[];
    state: DesktopTabsState;
    tab: (tabId: string) => DesktopTab | null;
}

export const DesktopTabsContext = React.createContext<DesktopTabsApi | null>(null);

/** Desktop only; throws on the web, where there are no tabs. */
export function useDesktopTabs(): DesktopTabsApi {
    const value = React.use(DesktopTabsContext);
    if (!value) {
        throw new Error('useDesktopTabs needs the desktop tabs provider.');
    }
    return value;
}

/** For shared components that run on web and desktop. */
export function useOptionalDesktopTabs(): DesktopTabsApi | null {
    return React.use(DesktopTabsContext);
}
