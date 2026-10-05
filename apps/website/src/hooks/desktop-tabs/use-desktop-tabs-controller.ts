import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { DesktopTabsApi } from './desktop-tabs-context.ts';
import {
    type DesktopTabsState,
    mountedTabLimit,
    shownTabIds,
    type TabLocation,
} from './desktop-tabs-model.ts';
import { focusedTabId } from './desktop-tabs-panes.ts';
import { type DesktopTabsAction, desktopTabsReducer } from './desktop-tabs-reducer.ts';
import { focusedSelection } from './desktop-tabs-selection.ts';
import { browserTabStore, readWindowTabs } from './desktop-tabs-window-store.ts';
import { moveTabsToNewWindow } from './move-tabs-to-new-window.ts';
import { claimTornOffTabs } from './torn-off-tab.ts';
import { useWindowTabsPersistence } from './use-window-tabs-persistence.ts';

/**
 * Owns one window's tabs for one Server (ADR 0039): the reducer, per-window
 * persistence, and closing the window when its last tab closes. Mount it
 * keyed by Server; `seed` is the route this window was opened with, used only
 * when the window has no tabs of its own yet.
 */
export function useDesktopTabsController({
    home,
    seed,
    serverId,
}: {
    home: TabLocation;
    seed: TabLocation | null;
    serverId: string;
}): DesktopTabsApi {
    const [state, dispatch] = React.useReducer(desktopTabsReducer, null, () =>
        readWindowTabs({
            claimed: claimTornOffTabs(serverId),
            home,
            ids: freshIds(),
            seed,
            serverId,
            store: browserTabStore(),
        })
    );
    const latest = React.useRef(state);
    latest.current = state;

    useWindowTabsPersistence(serverId, state);

    const windowEmpty = state.primary === null;
    React.useEffect(() => {
        if (windowEmpty) {
            void getDesktopBridge()?.closeWindow();
        }
    }, [windowEmpty]);

    const route = home.kind === 'app' ? home.path : '/';
    const commands = React.useMemo(
        () => tabCommands(dispatch, () => latest.current, { route, serverId }),
        [route, serverId]
    );
    const shown = React.useMemo(() => shownTabIds(state), [state]);
    const mounted = React.useMemo(() => mountedTabIds(state, shown), [state, shown]);

    return React.useMemo(
        () => ({
            ...commands,
            mountedTabIds: mounted,
            serverId,
            shownTabIds: shown,
            state,
            tab: (tabId: string) => state.tabs[tabId] ?? null,
        }),
        [commands, mounted, serverId, shown, state]
    );
}

type TabCommands = Omit<
    DesktopTabsApi,
    'mountedTabIds' | 'serverId' | 'shownTabIds' | 'state' | 'tab'
>;

function tabCommands(
    dispatch: React.Dispatch<DesktopTabsAction>,
    read: () => DesktopTabsState,
    window: { route: string; serverId: string }
): TabCommands {
    return {
        adopt: (bundle, to) => dispatch({ bundle, kind: 'adopt', to }),
        close: (tabIds) => {
            const target = tabIds ?? focusedSelection(read());
            if (target.length > 0) {
                dispatch({ kind: 'close', tabIds: target });
            }
        },
        duplicate: (tabIds) => dispatch({ kind: 'duplicate', newId: newId(), tabIds }),
        extendSelection: (tabId, gesture) => dispatch({ gesture, kind: 'extendSelection', tabId }),
        focusPane: (pane) => dispatch({ kind: 'focusPane', pane }),
        go: (tabId, delta) => dispatch({ kind: 'go', delta, tabId }),
        move: (tabIds, to) => dispatch({ kind: 'move', tabIds, to }),
        moveToNewWindow: (tabIds) => {
            void moveTabsToNewWindow(read(), tabIds, window).then((moved) => {
                if (moved) {
                    dispatch({ kind: 'release', tabIds });
                }
            });
        },
        navigate: (tabId, location, mode) =>
            dispatch({ kind: 'navigate', location, mode, newId: newId(), tabId }),
        openInFocusedPane: (location, intent) =>
            dispatch({ kind: 'openInFocusedPane', intent, location, newId: newId() }),
        openAfter: (tabId, location) =>
            dispatch({ afterTabId: tabId, kind: 'openAfter', location, newId: newId() }),
        openLink: (fromTabId, location, intent) =>
            dispatch({ kind: 'openLink', fromTabId, intent, location, newId: newId() }),
        release: (tabIds) => dispatch({ kind: 'release', tabIds }),
        reopenClosed: () => dispatch({ kind: 'reopenClosed' }),
        reveal: (location) => dispatch({ kind: 'reveal', location, newId: newId() }),
        savePageState: (tabId, pageState) => dispatch({ kind: 'savePageState', pageState, tabId }),
        select: (tabId) => dispatch({ kind: 'select', tabId }),
        selectInFocusedPane: (target) => {
            const tabId = tabInFocusedRow(read(), target);
            if (tabId) {
                dispatch({ kind: 'select', tabId });
            }
        },
    };
}

/**
 * ⌘1–9 and Control-Tab: the focused pane's row.
 * `index` is zero-based; `step` wraps.
 */
export function tabInFocusedRow(
    state: DesktopTabsState,
    target: { index: number } | { step: 1 | -1 }
): string | null {
    const row = state[state.focusedPane]?.tabIds ?? [];
    if ('index' in target) {
        return row[target.index] ?? null;
    }
    const current = row.indexOf(focusedTabId(state) ?? '');
    if (row.length === 0 || current < 0) {
        return null;
    }
    return row[(current + target.step + row.length) % row.length] ?? null;
}

/** Shown tabs always; then the most recent hidden ones up to `mountedTabLimit`. */
export function mountedTabIds(state: DesktopTabsState, shown: readonly string[]): string[] {
    return [...new Set([...shown, ...state.mru.slice(0, mountedTabLimit)])];
}

function freshIds() {
    return { entryKey: newId(), tabId: newId() };
}

function newId() {
    return crypto.randomUUID();
}
