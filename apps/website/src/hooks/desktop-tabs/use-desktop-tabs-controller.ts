import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { DesktopTabCommands } from './desktop-tabs-context.ts';
import type { DesktopTabsState, TabLocation } from './desktop-tabs-model.ts';
import { focusedTabId } from './desktop-tabs-panes.ts';
import { focusedSelection } from './desktop-tabs-selection.ts';
import { createDesktopTabsStore, type DesktopTabsStore } from './desktop-tabs-store.ts';
import { browserTabStore, readWindowTabs } from './desktop-tabs-window-store.ts';
import { moveTabsToNewWindow } from './move-tabs-to-new-window.ts';
import { claimTornOffTabs } from './torn-off-tab.ts';
import { useWindowTabsPersistence } from './use-window-tabs-persistence.ts';

/**
 * Owns one window's tabs for one Server (ADR 0039): the store, per-window
 * persistence, and closing the window when its last tab closes. Mount it
 * keyed by Server; `seed` is the route this window was opened with, used only
 * when the window has no tabs of its own yet. Returns the window's commands,
 * whose identity never changes.
 */
export function useDesktopTabsController({
    home,
    seed,
    serverId,
}: {
    home: TabLocation;
    seed: TabLocation | null;
    serverId: string;
}): DesktopTabCommands {
    const [store] = React.useState(() =>
        createDesktopTabsStore(
            readWindowTabs({
                claimed: claimTornOffTabs(serverId),
                home,
                ids: freshIds(),
                seed,
                serverId,
                store: browserTabStore(),
            })
        )
    );

    useWindowTabsPersistence(serverId, store);

    const windowEmpty = React.useSyncExternalStore(store.subscribe, () => isEmpty(store));
    React.useEffect(() => {
        if (windowEmpty) {
            void getDesktopBridge()?.closeWindow();
        }
    }, [windowEmpty]);

    const route = home.kind === 'app' ? home.path : '/';
    return React.useMemo(
        () => createDesktopTabCommands(store, { route, serverId }),
        [route, serverId, store]
    );
}

/** The window's commands over its store. Reads go to `latest()`, so a command never acts on stale tabs. */
export function createDesktopTabCommands(
    store: DesktopTabsStore,
    window: { route: string; serverId: string }
): DesktopTabCommands {
    const { dispatch } = store;
    const read = store.latest;
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
        savePageState: store.savePageState,
        select: (tabId) => dispatch({ kind: 'select', tabId }),
        selectInFocusedPane: (target) => {
            const tabId = tabInFocusedRow(read(), target);
            if (tabId) {
                dispatch({ kind: 'select', tabId });
            }
        },
        serverId: window.serverId,
        store,
        tab: (tabId) => read().tabs[tabId] ?? null,
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

function isEmpty(store: DesktopTabsStore) {
    return store.snapshot().primary === null;
}

function freshIds() {
    return { entryKey: newId(), tabId: newId() };
}

function newId() {
    return crypto.randomUUID();
}
