import type { DesktopTabsState, TabBundle, TabLocation } from './desktop-tabs-model.ts';
import { initialDesktopTabs } from './desktop-tabs-reducer.ts';
import {
    desktopTabsStorageKey,
    parseDesktopTabs,
    serializeDesktopTabs,
} from './desktop-tabs-storage.ts';
import { windowOfTabs } from './desktop-tabs-transfer.ts';

/** This window's own tab store: survives a reload, dies with the window. Injectable for tests. */
export type DesktopTabStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * A window's first tabs: its own (a reload); else the tabs it was torn off
 * with (`claimed`); else one tab at `seed` (the route the window opened on);
 * else one tab at `home`. Windows share no stored tabs: a new window never
 * inherits another window's.
 */
export function readWindowTabs(input: {
    claimed?: TabBundle | null;
    home: TabLocation;
    ids: { entryKey: string; tabId: string };
    seed: TabLocation | null;
    serverId: string;
    store: DesktopTabStore | null;
}): DesktopTabsState {
    const own = readItem(input.store, desktopTabsStorageKey(input.serverId));
    if (own) {
        return parseDesktopTabs(own, input.home, input.ids);
    }
    if (input.claimed) {
        return windowOfTabs(input.claimed);
    }
    return initialDesktopTabs(input.seed ?? input.home, input.ids);
}

/** Writes the window's own tabs. A closing window (no tab) writes nothing. */
export function writeWindowTabs(
    store: DesktopTabStore | null,
    serverId: string,
    state: DesktopTabsState
) {
    if (!(store && state.primary)) {
        return;
    }
    try {
        store.setItem(desktopTabsStorageKey(serverId), serializeDesktopTabs(state));
    } catch {
        // Quota or blocked storage: tabs then last for this window's lifetime only.
    }
}

/** This window's session storage, or null where storage is blocked. */
export function browserTabStore(): DesktopTabStore | null {
    try {
        return sessionStorage;
    } catch {
        return null;
    }
}

function readItem(store: DesktopTabStore | null, key: string) {
    try {
        return store?.getItem(key) ?? null;
    } catch {
        return null;
    }
}
