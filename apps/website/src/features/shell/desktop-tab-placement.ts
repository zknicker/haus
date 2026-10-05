import {
    allTabIds,
    type DesktopTabsState,
    type PaneSide,
    paneOfTab,
    shownTabIds,
} from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { desktopTabsReducer } from '../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import { slotTarget } from './tab-drag/tab-drag-projection.ts';
import type { TabDragView } from './tab-drag/tab-drag-view.ts';

/**
 * Which tab the window body draws in which pane rect (ADR 0039). Every
 * mounted tab frame lives in one layer and is positioned over its pane, so
 * this is the whole of "where does a tab's content show".
 *
 * While a tab drags across rows, the body previews the drop: the tabs are
 * placed as the committed `move` would place them, without dispatching it.
 * The destination pane shows the dragged tabs' active one; the source pane shows its next
 * selection by the ordinary move rule. A move that would empty the source
 * pane keeps both pane rects until release (the band keeps both rows too),
 * the emptied one blank, and collapses on the drop. Crossing back or Escape
 * clears the view and the committed placement returns; a drop commits the
 * same `move`, so the body does not change again.
 */
export interface TabPlacement {
    /** The pane rect the person last interacted with, by this placement. */
    focusedPane: PaneSide;
    /** Each placed tab's pane rect. */
    panes: Readonly<Record<string, PaneSide>>;
    /** Tabs on screen. */
    shown: readonly string[];
}

/** One frame's position and presence, as primitives so a memoized frame can bail out. */
export interface TabFramePlacement {
    /** Its pane rect is the focused pane (always, with one pane). */
    focusedPane: boolean;
    pane: PaneSide;
    /** On screen and committed there: counts as viewing for unread clearing. */
    shown: boolean;
    /** On screen, committed or previewed: its Activity is visible. */
    visible: boolean;
}

export function placeTabs(state: DesktopTabsState, drag: TabDragView | null): TabPlacement {
    const target = drag ? slotTarget(state, drag.draggingIds, drag.slot) : null;
    if (!(drag && target)) {
        return placementOf(state);
    }
    const moved = desktopTabsReducer(state, { kind: 'move', tabIds: drag.draggingIds, to: target });
    const collapses = state.secondary !== null && moved.secondary === null;
    if (!collapses) {
        return placementOf(moved);
    }
    // The emptied pane's rect stays until the drop; every tab sits over the target's.
    const panes = Object.fromEntries(allTabIds(moved).map((id) => [id, target.pane]));
    return { focusedPane: target.pane, panes, shown: shownTabIds(moved) };
}

/**
 * The frames the layer renders, in a stable order (by id): mounted tabs plus
 * anything a drag previews onto the screen. A keyed sibling list whose order
 * never changes means React never moves a frame's DOM, so nothing in it
 * (scroll offsets, focus, a web view's host) is disturbed by a move.
 */
export function layerTabIds(
    mounted: readonly string[],
    placement: TabPlacement
): readonly string[] {
    return [...new Set([...mounted, ...placement.shown])]
        .filter((id) => id in placement.panes)
        .sort();
}

/** `viewable`: the tabs that may count as viewed (`viewableTabIds`). */
export function framePlacement(
    tabId: string,
    placement: TabPlacement,
    viewable: readonly string[]
): TabFramePlacement {
    const pane = placement.panes[tabId] ?? 'primary';
    const visible = placement.shown.includes(tabId);
    return {
        focusedPane: placement.focusedPane === pane,
        pane,
        // A tab previewed onto the screen mid-drag is not viewed until the drop commits it.
        shown: visible && viewable.includes(tabId),
        visible,
    };
}

/**
 * The tabs that count as viewed if on screen: committed shown tabs, minus tabs
 * riding in from another window. Those are adopted here only as a preview
 * until the drop; Escape or leaving the band takes them away unviewed.
 */
export function viewableTabIds(
    committedShown: readonly string[],
    drag: TabDragView | null
): readonly string[] {
    if (!drag?.visiting) {
        return committedShown;
    }
    return committedShown.filter((id) => !drag.draggingIds.includes(id));
}

function placementOf(state: DesktopTabsState): TabPlacement {
    const panes = Object.fromEntries(
        allTabIds(state).map((id) => [id, paneOfTab(state, id) ?? 'primary'])
    );
    return {
        focusedPane: state.focusedPane,
        panes,
        shown: shownTabIds(state),
    };
}
