import * as React from 'react';
import {
    type DesktopTab,
    type DesktopTabsState,
    type PaneSide,
    shownTabIds,
    type TabBundle,
    type TabLocation,
    type TabPageState,
} from './desktop-tabs-model.ts';
import { mountedTabIds } from './desktop-tabs-mounted.ts';
import type { SelectionGesture } from './desktop-tabs-selection.ts';
import type { DesktopTabsStore } from './desktop-tabs-store.ts';

/**
 * A window's tab commands (ADR 0039). The controller
 * (`useDesktopTabsController`) creates one per window and its identity never
 * changes, so reading it re-renders nothing. Read state through
 * `useDesktopTabsSelector` (one slice) or `useDesktopTabs` (all of it, for
 * the strip, panes, and shortcuts).
 *
 * SEAM: add members here first, then implement; consumers never reach into
 * the reducer.
 */
export interface DesktopTabCommands {
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
    /** Go (sidebar, command menu): the left pane's selected tab pushes `location`; never dedupes. */
    goTo: (location: TabLocation) => void;
    /** Several tabs move together, side by side in row order. */
    move: (tabIds: readonly string[], to: { index: number; pane: PaneSide }) => void;
    /**
     * Move to new window: `tabIds` leave for a new window, live pages and history
     * intact, like a tear-off; no closed-tab records. No-op when they are the window's every tab.
     */
    moveToNewWindow: (tabIds: readonly string[]) => void;
    navigate: (tabId: string, location: TabLocation, mode: 'push' | 'replace') => void;
    /**
     * Open (anything activated inside a page, notifications, deep links, ⌘F): a selected tab
     * in the right pane, creating it; a right-pane tab already on that page is selected
     * instead. `fromTabId` is the tab the open came from, null when none did.
     */
    open: (fromTabId: string | null, location: TabLocation) => void;
    /** The tab menu's New tab to the right: a new selected tab right after `tabId`. */
    openAfter: (tabId: string, location: TabLocation) => void;
    /** ⌘T and the row's plus: a new selected tab at the end of the focused pane's row. */
    openNewTab: (location: TabLocation) => void;
    /** ⌘, and the Settings button: the window's one Settings tab, else a new one in the left pane. */
    openSettings: (location: TabLocation) => void;
    /**
     * A modified click (⌘, middle, Shift): a new tab right after `fromTabId` in its pane
     * (null: the left pane's selected tab), in the background or selected; never dedupes.
     */
    openTab: (
        fromTabId: string | null,
        location: TabLocation,
        options: { background: boolean }
    ) => void;
    /** Tabs dragged out to another window leave, without closed-tab records. */
    release: (tabIds: readonly string[]) => void;
    /** ⌘⇧T. */
    reopenClosed: () => void;
    /**
     * Saves into the tab's current history entry. Re-renders nothing: page
     * state is read back through `tab` when a page shows, never rendered.
     */
    savePageState: (tabId: string, pageState: TabPageState) => void;
    /** A plain click: shows the tab, collapsing any multi-selection. */
    select: (tabId: string) => void;
    /** ⌘1–9 and Control-Tab act on the focused pane's row. */
    selectInFocusedPane: (target: { index: number } | { step: 1 | -1 }) => void;
    /** The Server these tabs belong to; tabs move only between windows on the same Server. */
    serverId: string;
    readonly store: DesktopTabsStore;
    /** The tab as of now, saved page state included; for effects and handlers, not render. */
    tab: (tabId: string) => DesktopTab | null;
}

/** Commands plus the whole rendered state; changes on every dispatch. */
export interface DesktopTabsApi extends DesktopTabCommands {
    /** Tabs whose React tree stays mounted (shown + most recent hidden, up to `mountedTabLimit`). */
    mountedTabIds: readonly string[];
    /** Tabs on screen: one per pane. */
    shownTabIds: readonly string[];
    state: DesktopTabsState;
}

export const DesktopTabsContext = React.createContext<DesktopTabCommands | null>(null);

/** Desktop only; throws on the web, where there are no tabs. Stable: never re-renders its caller. */
export function useDesktopTabCommands(): DesktopTabCommands {
    const commands = React.use(DesktopTabsContext);
    if (!commands) {
        throw new Error('Desktop tabs need the desktop tabs provider.');
    }
    return commands;
}

/**
 * For shared components that run on web and desktop: the window's tab
 * commands, or null on the web. Stable: never re-renders its caller.
 */
export function useOptionalDesktopTabs(): DesktopTabCommands | null {
    return React.use(DesktopTabsContext);
}

/**
 * One slice of the rendered tabs state; re-renders only when it changes.
 * `select` must return a primitive or an object already in the state (a tab,
 * an entry, a location), never a fresh one.
 */
export function useDesktopTabsSelector<T>(select: (state: DesktopTabsState) => T): T {
    return useOptionalDesktopTabsSelector(useDesktopTabCommands(), select) as T;
}

/** `useDesktopTabsSelector` for shared components: null on the web. */
export function useOptionalDesktopTabsSelector<T>(
    commands: DesktopTabCommands | null,
    select: (state: DesktopTabsState) => T
): T | null {
    const store = commands?.store;
    const read = () => (store ? select(store.snapshot()) : null);
    return React.useSyncExternalStore(store?.subscribe ?? noSubscription, read, read);
}

/**
 * Every rendered field. Re-renders its caller on every dispatch: only window
 * chrome that draws all tabs (strip, panes, tab layer, shortcuts) reads it.
 */
export function useDesktopTabs(): DesktopTabsApi {
    const commands = useDesktopTabCommands();
    const { store } = commands;
    const state = React.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
    return React.useMemo(() => {
        const shown = shownTabIds(state);
        return {
            ...commands,
            mountedTabIds: mountedTabIds(state, shown),
            shownTabIds: shown,
            state,
            tab: (tabId: string) => state.tabs[tabId] ?? null,
        };
    }, [commands, state]);
}

const noSubscription = () => () => undefined;
