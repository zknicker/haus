import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { allTabIds, type DesktopTabsState } from './desktop-tabs-model.ts';
import { bundleOf } from './desktop-tabs-transfer.ts';

/**
 * Move to new window (ADR 0039): the menu's tear-off. The tabs need somewhere
 * to leave from, so a window's every tab has nowhere to go.
 */
export function canMoveToNewWindow(state: DesktopTabsState, tabIds: readonly string[]): boolean {
    const all = allTabIds(state);
    return (
        tabIds.length > 0 && tabIds.every((id) => all.includes(id)) && all.length > tabIds.length
    );
}

/**
 * Hands the tabs to Electron, which opens a window offset from this one that
 * claims them as a torn-off window does and moves their live web views there
 * before resolving. True once they have left, so the caller releases them
 * (a release is not a close: Reopen Closed Tab never sees them).
 */
export async function moveTabsToNewWindow(
    state: DesktopTabsState,
    tabIds: readonly string[],
    window: { route: string; serverId: string }
): Promise<boolean> {
    const move = getDesktopBridge()?.tabMoveToNewWindow;
    const bundle = canMoveToNewWindow(state, tabIds) ? bundleOf(state, tabIds) : null;
    if (!(move && bundle)) {
        return false;
    }
    try {
        return (await move({ bundle, ...window })) === true;
    } catch (error) {
        console.warn('[Haus] Could not move tabs to a new window.', error);
        return false;
    }
}
