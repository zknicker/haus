import {
    type DesktopTabsState,
    type PaneSide,
    paneOfTab,
} from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import type { Slot } from './tab-drag-geometry.ts';

/**
 * What a row draws while tabs drag in this window: the dragged tabs (one, or
 * a multi-selection) leave their rows and sit side by side, in order, at
 * their slot. Nothing is committed until the drop.
 */
export function projectRow(
    state: DesktopTabsState,
    row: PaneSide,
    drag: { slot: Slot; tabIds: readonly string[] } | null
): readonly string[] {
    const ids = rowTabIds(state, row);
    if (!drag) {
        return ids;
    }
    const rest = ids.filter((id) => !drag.tabIds.includes(id));
    if (drag.slot.row !== row) {
        return rest;
    }
    const at = Math.max(0, Math.min(drag.slot.index, rest.length));
    return [...rest.slice(0, at), ...drag.tabIds, ...rest.slice(at)];
}

export function rowTabIds(state: DesktopTabsState, row: PaneSide): readonly string[] {
    return state[row]?.tabIds ?? [];
}

/**
 * A drag's starting slot: where `tabId` (the pressed tab) sits among the
 * row's tabs outside `tabIds`, so a dragged selection gathers around it.
 */
export function slotOfTab(
    state: DesktopTabsState,
    tabId: string,
    tabIds: readonly string[] = [tabId]
): Slot | null {
    const pane = paneOfTab(state, tabId);
    if (!pane) {
        return null;
    }
    const row = rowTabIds(state, pane);
    const before = row.slice(0, row.indexOf(tabId)).filter((id) => !tabIds.includes(id));
    return { index: before.length, row: pane };
}

/**
 * The `move` (or `adopt`) target a slot stands for, or null when the tabs
 * would land where they are (side by side, in order, at that slot). The tabs
 * may be absent from `state` (arriving from another window).
 */
export function slotTarget(
    state: DesktopTabsState,
    tabIds: readonly string[],
    slot: Slot
): { index: number; pane: PaneSide } | null {
    const row = rowTabIds(state, slot.row);
    const others = row.filter((id) => !tabIds.includes(id));
    const at = Math.max(0, Math.min(slot.index, others.length));
    const resolved = { index: at, pane: slot.row };
    const landed = [...others.slice(0, at), ...tabIds, ...others.slice(at)];
    const unchanged =
        tabIds.every((id) => paneOfTab(state, id) === slot.row) &&
        landed.length === row.length &&
        landed.every((id, index) => row[index] === id);
    return unchanged ? null : resolved;
}
