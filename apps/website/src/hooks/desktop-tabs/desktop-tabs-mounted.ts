import { type DesktopTabsState, mountedTabLimit } from './desktop-tabs-model.ts';

/** Shown tabs always; then the most recent hidden ones up to `mountedTabLimit`. */
export function mountedTabIds(state: DesktopTabsState, shown: readonly string[]): string[] {
    return [...new Set([...shown, ...state.mru.slice(0, mountedTabLimit)])];
}
