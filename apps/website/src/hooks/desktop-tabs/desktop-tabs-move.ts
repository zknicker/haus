import { type DesktopTabsState, type PaneSide, paneOfTab } from './desktop-tabs-model.ts';
import { removeTab } from './desktop-tabs-panes.ts';
import { selectMoved } from './desktop-tabs-selection.ts';
import { placeTogether } from './desktop-tabs-transfer.ts';

/**
 * Drag and the tab menu's pane move: reorder within a row, move between rows,
 * or open the second pane. Several tabs (a dragged multi-selection) move
 * together, gathered side by side in row order at `to.index` among the
 * target row's other tabs, as Chrome gathers dragged tabs. The moved tabs
 * stay selected together, showing the one their row showed (else the first),
 * and their pane takes focus. Moving every tab of a one-pane window to a new
 * secondary pane is a no-op.
 */
export function moveTabs(
    state: DesktopTabsState,
    tabIds: readonly string[],
    to: { index: number; pane: PaneSide }
): DesktopTabsState {
    const from = tabIds[0] ? paneOfTab(state, tabIds[0]) : null;
    const row = from ? state[from] : null;
    if (!(from && row && tabIds.every((id) => row.tabIds.includes(id)))) {
        return state;
    }
    const moving = row.tabIds.filter((id) => tabIds.includes(id));
    const first = moving[0];
    if (
        !first ||
        (to.pane === 'secondary' && !state.secondary && moving.length === row.tabIds.length)
    ) {
        return state;
    }
    const active = moving.includes(row.selectedTabId) ? row.selectedTabId : first;
    const anchor = row.selection?.anchorTabId;
    const keptAnchor = anchor && moving.includes(anchor) ? anchor : active;
    if (from === to.pane) {
        const rest = row.tabIds.filter((id) => !moving.includes(id));
        const at = Math.max(0, Math.min(to.index, rest.length));
        const reordered = {
            ...state,
            [from]: { ...row, tabIds: [...rest.slice(0, at), ...moving, ...rest.slice(at)] },
        };
        return selectMoved(reordered, moving, active, keptAnchor);
    }
    // Removing first may promote the secondary pane to primary; the target follows it.
    const removed = moving.reduce(removeTab, state);
    const promoted = from === 'primary' && !removed.secondary && state.secondary !== null;
    const placed = placeTogether(removed, { ...to, pane: promoted ? 'primary' : to.pane }, moving);
    return selectMoved(placed, moving, active, keptAnchor);
}
