import type { WorkspaceTabsState } from './workspace-tabs-model.ts';
import {
    parseWorkspaceMode,
    parseWorkspaceTabs,
    readWorkspaceTabs,
    type WorkspaceTabStores,
    workspaceModeStorageKey,
} from './workspace-tabs-storage.ts';

/** This window's first tabs: its own (a reload), else the shared seed. */
export function readWindowTabs(serverId: string): WorkspaceTabsState {
    try {
        const mode = parseWorkspaceMode(localStorage.getItem(workspaceModeStorageKey));
        return readWorkspaceTabs({ local: localStorage, session: sessionStorage }, serverId, mode);
    } catch {
        return parseWorkspaceTabs(null);
    }
}

export function writeWindowStores(write: (stores: WorkspaceTabStores) => void) {
    try {
        write({ local: localStorage, session: sessionStorage });
    } catch {
        // Storage can be unavailable; tabs and the mode then last for this window only.
    }
}
