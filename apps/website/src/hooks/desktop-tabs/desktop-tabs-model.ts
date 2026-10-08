/**
 * Desktop tabs are equal pages (ADR 0039). A window holds one or two panes;
 * each pane holds an ordered row of tabs; each tab is a full page with its own
 * bounded back/forward history. One pane holding every tab is the whole
 * window; moving a tab to the right pane splits it.
 *
 * The types and constants here are the contract the reducer, storage, and
 * every tab consumer share (docs/internals/react.md#shell).
 */

/** The left pane always exists while the window has a tab; the right one only once a tab moves there. */
export type PaneSide = 'primary' | 'secondary';

/**
 * What one history entry shows. `app` is a full App router path inside the
 * window's Server (`/s/<slug>/chats/<id>?…`), so a tab's router matches the
 * same `s/:slug/…` route table the web uses. `browser` is an Electron-owned
 * web view; its own in-page history lives in Electron, and its address and
 * title are kept here so a closed or evicted view restores by URL. `newTab` is
 * the new tab page (⌘T, the row's plus): an address field and recent sites;
 * choosing one pushes a `browser` entry onto the same tab.
 */
export type TabLocation =
    | { kind: 'app'; path: string }
    | { kind: 'browser'; title: string; url: string; viewId: string }
    | { kind: 'newTab' };

/** Where ⌘T and the row's plus open a tab. */
export const newTabLocation: TabLocation = { kind: 'newTab' };

/**
 * Cheap, restorable page state kept per history entry. Pages own their own
 * keys; anything expensive (drafts) already lives in its own store.
 */
export interface TabPageState {
    /** The page's main scroll offset, restored when a tab rebuilds or reveals. */
    scrollTop?: number;
}

export interface TabHistoryEntry {
    /** Unique per entry; becomes the router location key. */
    key: string;
    location: TabLocation;
    pageState: TabPageState;
}

/** `entries[index]` is the current page. Never empty. */
export interface TabHistory {
    entries: readonly TabHistoryEntry[];
    index: number;
}

export interface DesktopTab {
    history: TabHistory;
    id: string;
}

/**
 * A pane's row. `selectedTabId` is the tab the pane shows (Chrome's active
 * tab), always one of `tabIds`; a pane is never empty. `selection` is
 * Chrome's multi-selection, present only while more than the shown tab is
 * selected (`desktop-tabs-selection.ts`); it is never persisted.
 */
export interface PaneState {
    selectedTabId: string;
    selection?: TabSelection;
    tabIds: readonly string[];
}

/**
 * Two or more selected tabs of one row, in row order, the shown tab among
 * them. `anchorTabId` (also selected) is where Shift-click ranges start.
 */
export interface TabSelection {
    anchorTabId: string;
    tabIds: readonly string[];
}

/**
 * Tabs moving between windows together (a drag of a multi-selection), in row
 * order, with the one the destination shows. The wire shape of a tab drag.
 */
export interface TabBundle {
    activeTabId: string;
    tabs: readonly DesktopTab[];
}

/**
 * A closed tab, kept in memory for Reopen Closed Tab with its history.
 * `pane` follows the panes as they change: when the left pane closes and the
 * right one becomes the primary, its entries become `primary` and the left
 * pane's become `closedPrimary`, so reopening one recreates the left pane
 * (Chrome restoring a tab into its closed window).
 */
export interface ClosedDesktopTab {
    index: number;
    pane: PaneSide | 'closedPrimary';
    tab: DesktopTab;
}

/**
 * One window's tabs for one Server. A window with no tab left is closing; the
 * reducer reports that as `primary: null` and the controller closes the window.
 */
export interface DesktopTabsState {
    closed: readonly ClosedDesktopTab[];
    /** The pane the person last interacted with: the sidebar, ⌘T, ⌘W, and ⌘1–9 act on it. */
    focusedPane: PaneSide;
    /** Most recently shown first; the first `mountedTabLimit` stay mounted while hidden. */
    mru: readonly string[];
    /**
     * Chrome's opener run: the tab links last opened from, and the newest tab opened from
     * it, so the next open from the same tab lands after that one (opener, A, B, C).
     * Selecting a tab ends the run (`desktop-tabs-reducer.ts`). Absent: no run. Never persisted.
     */
    openerRun?: OpenerRun;
    primary: PaneState | null;
    secondary: PaneState | null;
    tabs: Readonly<Record<string, DesktopTab>>;
}

export interface OpenerRun {
    lastOpenedTabId: string;
    openerTabId: string;
}

export const mountedTabLimit = 5;
export const tabHistoryLimit = 50;
export const closedTabLimit = 20;

/**
 * The tabs on screen: each pane's selection. Visible tabs of a focused window
 * count as viewing in focus for unread clearing (ADR 0039).
 */
export function shownTabIds(state: DesktopTabsState): string[] {
    return [state.primary?.selectedTabId, state.secondary?.selectedTabId].filter(
        (id): id is string => id !== undefined
    );
}

/** Every tab in row order: the primary pane's, then the secondary's. */
export function allTabIds(state: DesktopTabsState): string[] {
    return [...(state.primary?.tabIds ?? []), ...(state.secondary?.tabIds ?? [])];
}

/** The pane a tab belongs to. */
export function paneOfTab(state: DesktopTabsState, tabId: string): PaneSide | null {
    if (state.primary?.tabIds.includes(tabId)) {
        return 'primary';
    }
    return state.secondary?.tabIds.includes(tabId) ? 'secondary' : null;
}

export function currentEntry(tab: DesktopTab): TabHistoryEntry {
    const entry = tab.history.entries[tab.history.index];
    if (!entry) {
        throw new Error(`Tab ${tab.id} has no current history entry.`);
    }
    return entry;
}

export function currentLocation(tab: DesktopTab): TabLocation {
    return currentEntry(tab).location;
}

/**
 * A page's identity, for "already open in the other pane → select it" and
 * notification reveal. Search and hash are drill-down inside a page, so they
 * do not change identity; two browser tabs are never the same page.
 */
export function tabPageKey(location: TabLocation): string {
    if (location.kind === 'browser') {
        return `browser:${location.viewId}`;
    }
    if (location.kind === 'newTab') {
        return 'newTab';
    }
    const pathname = location.path.split(/[?#]/u)[0] ?? '';
    // `/s/<slug>/<section>/<id>…` → `<section>/<id>`; ids name the page, deeper segments drill in.
    const [, , , section = '', id, anchor] = pathname.split('/');
    // A Thread is `threads/<chatId>/<anchorId>`: both segments name it.
    if (section === 'threads' && id && anchor) {
        return `${section}/${id}/${anchor}`;
    }
    return idSections.has(section) && id ? `${section}/${id}` : section;
}

/**
 * Where a plain open of a page lands once no tab already shows it (ADR 0039). `place`: the
 * current tab navigates (the place rule). `newTab`: an Agent profile or Settings opens as a new
 * selected tab after the source. `sidePane`: a Thread opens as a new selected tab in the right
 * pane, creating it.
 */
export type PagePlacement = 'newTab' | 'place' | 'sidePane';

export function pagePlacement(location: TabLocation): PagePlacement {
    if (location.kind !== 'app') {
        return 'place';
    }
    const key = tabPageKey(location);
    if (key.startsWith('threads/')) {
        return 'sidePane';
    }
    return key === 'settings' || key.startsWith('agents/') ? 'newTab' : 'place';
}

/** Sections whose second segment names a different page rather than a drill-down. */
const idSections = new Set(['agents', 'artifacts', 'chats', 'dm', 'files', 'threads']);
