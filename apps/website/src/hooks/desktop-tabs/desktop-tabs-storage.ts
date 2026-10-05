import { boundHistory } from './desktop-tabs-history.ts';
import type {
    DesktopTab,
    DesktopTabsState,
    PaneSide,
    PaneState,
    TabBundle,
    TabHistoryEntry,
    TabLocation,
    TabPageState,
} from './desktop-tabs-model.ts';
import { syncMru } from './desktop-tabs-panes.ts';
import { initialDesktopTabs } from './desktop-tabs-reducer.ts';

/**
 * Per-window, per-Server persistence (ADR 0039): the window's sessionStorage
 * holds its own tabs; windows share nothing (`desktop-tabs-window-store.ts`). Stored:
 * panes, tab order and each pane's shown tab (not a multi-selection), focused pane, and each tab's
 * bounded history with page state. Not stored: `closed`, `mru`.
 *
 * Old shapes (`haus.workspaceTabs.<serverId>` from the primary-tab model) are
 * not migrated: anything that does not parse as the current shape starts one
 * pane with one tab at `fallback` (Inbox). Unknown fields, such as an
 * older window's `layout`, are ignored.
 */
export const desktopTabsStorageVersion = 1;

export function desktopTabsStorageKey(serverId: string) {
    return `haus.desktopTabs.v${desktopTabsStorageVersion}.${serverId}`;
}

export function serializeDesktopTabs(state: DesktopTabsState): string {
    const tabs = Object.fromEntries(
        Object.values(state.tabs).map((tab) => [
            tab.id,
            { ...tab, history: boundHistory(tab.history) },
        ])
    );
    return JSON.stringify({
        focusedPane: state.focusedPane,
        primary: storedPane(state.primary),
        secondary: storedPane(state.secondary),
        tabs,
        version: desktopTabsStorageVersion,
    });
}

/** A multi-selection resets on reload, as in Chrome: only the shown tab is stored. */
function storedPane(row: PaneState | null) {
    return row ? { selectedTabId: row.selectedTabId, tabIds: row.tabIds } : null;
}

/** Validates every field; malformed tabs drop out, and nothing usable left means one tab at `fallback`. */
export function parseDesktopTabs(
    raw: string | null,
    fallback: TabLocation,
    ids: { entryKey: string; tabId: string }
): DesktopTabsState {
    return parseStored(raw) ?? initialDesktopTabs(fallback, ids);
}

function parseStored(raw: string | null): DesktopTabsState | null {
    const value = parseJson(raw);
    if (!isRecord(value) || value.version !== desktopTabsStorageVersion || !isRecord(value.tabs)) {
        return null;
    }
    // fromEntries defines own keys, so a stored `__proto__` id cannot reach the prototype.
    const tabs: Record<string, DesktopTab> = Object.fromEntries(
        Object.entries(value.tabs).flatMap(([id, item]) => {
            const tab = parseTab(id, item);
            return tab ? [[id, tab] as const] : [];
        })
    );
    const primary = parsePane(value.primary, tabs, new Set());
    const secondary = parsePane(value.secondary, tabs, new Set(primary?.tabIds));
    const panes = primary ? { primary, secondary } : { primary: secondary, secondary: null };
    if (!panes.primary) {
        return null;
    }
    const placed = new Set([...panes.primary.tabIds, ...(panes.secondary?.tabIds ?? [])]);
    const focusedPane: PaneSide =
        value.focusedPane === 'secondary' && panes.secondary ? 'secondary' : 'primary';
    return syncMru({
        closed: [],
        focusedPane,
        mru: [],
        ...panes,
        tabs: Object.fromEntries(Object.entries(tabs).filter(([id]) => placed.has(id))),
    });
}

/**
 * Tabs from outside this window (a cross-window drag), each validated like a
 * stored one. Every tab must parse, ids must be unique, and the active tab
 * must be among them; anything else is null.
 */
export function parseTabBundle(value: unknown): TabBundle | null {
    if (!(isRecord(value) && Array.isArray(value.tabs) && typeof value.activeTabId === 'string')) {
        return null;
    }
    const tabs = value.tabs.map((tab) =>
        isRecord(tab) && typeof tab.id === 'string' && tab.id ? parseTab(tab.id, tab) : null
    );
    const valid = tabs.filter((tab): tab is DesktopTab => tab !== null);
    const ids = new Set(valid.map((tab) => tab.id));
    if (valid.length === 0 || valid.length !== tabs.length || ids.size !== valid.length) {
        return null;
    }
    return ids.has(value.activeTabId) ? { activeTabId: value.activeTabId, tabs: valid } : null;
}

function parseTab(id: string, value: unknown): DesktopTab | null {
    if (!(isRecord(value) && value.id === id && isRecord(value.history))) {
        return null;
    }
    const { entries, index } = value.history;
    if (!Array.isArray(entries) || entries.length === 0) {
        return null;
    }
    const parsed = entries.map(parseEntry);
    if (parsed.some((entry) => entry === null)) {
        return null;
    }
    const valid = parsed.filter((entry): entry is TabHistoryEntry => entry !== null);
    const at =
        Number.isInteger(index) && (index as number) >= 0 ? (index as number) : valid.length - 1;
    return { history: boundHistory({ entries: valid, index: Math.min(at, valid.length - 1) }), id };
}

function parseEntry(value: unknown): TabHistoryEntry | null {
    if (!(isRecord(value) && typeof value.key === 'string' && value.key)) {
        return null;
    }
    const location = parseLocation(value.location);
    return location
        ? { key: value.key, location, pageState: parsePageState(value.pageState) }
        : null;
}

function parseLocation(value: unknown): TabLocation | null {
    if (!isRecord(value)) {
        return null;
    }
    if (value.kind === 'app') {
        return typeof value.path === 'string' && value.path.startsWith('/')
            ? { kind: 'app', path: value.path }
            : null;
    }
    if (value.kind === 'newTab') {
        return { kind: 'newTab' };
    }
    if (
        value.kind === 'browser' &&
        typeof value.title === 'string' &&
        typeof value.url === 'string' &&
        typeof value.viewId === 'string' &&
        value.viewId
    ) {
        return { kind: 'browser', title: value.title, url: value.url, viewId: value.viewId };
    }
    return null;
}

function parsePageState(value: unknown): TabPageState {
    return isRecord(value) &&
        typeof value.scrollTop === 'number' &&
        Number.isFinite(value.scrollTop)
        ? { scrollTop: value.scrollTop }
        : {};
}

/** Known, unique tab ids only; a selection outside the row falls to its first tab. */
function parsePane(
    value: unknown,
    tabs: Record<string, DesktopTab>,
    taken: ReadonlySet<string>
): PaneState | null {
    if (!(isRecord(value) && Array.isArray(value.tabIds))) {
        return null;
    }
    const tabIds = [
        ...new Set(
            value.tabIds.filter(
                (id): id is string =>
                    typeof id === 'string' && Object.hasOwn(tabs, id) && !taken.has(id)
            )
        ),
    ];
    const [first] = tabIds;
    if (!first) {
        return null;
    }
    const selected = value.selectedTabId;
    return {
        selectedTabId: typeof selected === 'string' && tabIds.includes(selected) ? selected : first,
        tabIds,
    };
}

function parseJson(raw: string | null): unknown {
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
