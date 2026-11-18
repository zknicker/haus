import { expect, test } from 'bun:test';
import type { DesktopTabsState, PaneState } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { desktopTabsReducer } from '../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import { framePlacement, layerTabIds, placeTabs, viewableTabIds } from './desktop-tab-placement.ts';
import { slotTarget } from './tab-drag/tab-drag-projection.ts';
import type { TabDragView } from './tab-drag/tab-drag-view.ts';

function windowTabs(
    primary: [string[], string],
    secondary: [string[], string] | null
): DesktopTabsState {
    const pane = ([tabIds, selectedTabId]: [string[], string]): PaneState => ({
        selectedTabId,
        tabIds,
    });
    return {
        closed: [],
        focusedPane: 'primary',
        mru: [],
        primary: pane(primary),
        secondary: secondary ? pane(secondary) : null,
        tabs: {},
    };
}

/** What the drop commits for `drag`, as the engine's `commit` effect does. */
function drop(state: DesktopTabsState, drag: TabDragView): DesktopTabsState {
    const to = slotTarget(state, drag.draggingIds, drag.slot);
    return to ? desktopTabsReducer(state, { kind: 'move', tabIds: drag.draggingIds, to }) : state;
}

const state = windowTabs([['a', 'b', 'c'], 'a'], [['d', 'e'], 'd']);
const intoRight: TabDragView = {
    draggingIds: ['a'],
    slot: { index: 1, row: 'secondary' },
    visiting: false,
};

test('with no drag, each tab sits over its own pane and the selections show', () => {
    const placement = placeTabs(state, null);
    expect(placement.panes).toEqual({
        a: 'primary',
        b: 'primary',
        c: 'primary',
        d: 'secondary',
        e: 'secondary',
    });
    expect(placement.shown).toEqual(['a', 'd']);
    expect(placement.focusedPane).toBe('primary');
});

test('a tab dragged into the other row shows there at once; its old pane shows its next tab', () => {
    const placement = placeTabs(state, intoRight);
    expect(placement.panes.a).toBe('secondary');
    expect(placement.panes.b).toBe('primary');
    expect(placement.shown).toEqual(['b', 'a']);
    expect(placement.focusedPane).toBe('secondary');
});

test('crossing back to its own slot, or Escape clearing the view, restores the committed placement', () => {
    const back: TabDragView = {
        draggingIds: ['a'],
        slot: { index: 0, row: 'primary' },
        visiting: false,
    };
    expect(placeTabs(state, back)).toEqual(placeTabs(state, null));
});

test('the drop commits exactly the previewed placement', () => {
    expect(placeTabs(drop(state, intoRight), null)).toEqual(placeTabs(state, intoRight));
});

test('a move that would empty its pane keeps that rect blank until the drop collapses it', () => {
    const lone = windowTabs([['a'], 'a'], [['d', 'e'], 'd']);
    const placement = placeTabs(lone, intoRight);
    expect(placement.panes).toEqual({ a: 'secondary', d: 'secondary', e: 'secondary' });
    expect(placement.shown).toEqual(['a']);
    expect(placement.focusedPane).toBe('secondary');
    const committed = placeTabs(drop(lone, intoRight), null);
    expect(committed.panes).toEqual({ a: 'primary', d: 'primary', e: 'primary' });
    expect(committed.shown).toEqual(['a']);
});

test('one pane draws every tab over it, and a drag within the row stays there', () => {
    const one = windowTabs([['a', 'b', 'c'], 'a'], null);
    const drag: TabDragView = {
        draggingIds: ['a'],
        slot: { index: 2, row: 'primary' },
        visiting: false,
    };
    const placement = placeTabs(one, drag);
    expect(Object.values(placement.panes)).toEqual(['primary', 'primary', 'primary']);
    expect(placement.shown).toEqual(['a']);
});

test('a tab previewed onto the screen is visible but not viewed until the drop commits it', () => {
    const placement = placeTabs(state, intoRight);
    const committedShown = placeTabs(state, null).shown;
    expect(framePlacement('b', placement, committedShown)).toEqual({
        focusedPane: false,
        pane: 'primary',
        shown: false,
        visible: true,
    });
    expect(framePlacement('a', placement, committedShown)).toEqual({
        focusedPane: true,
        pane: 'secondary',
        shown: true,
        visible: true,
    });
    expect(framePlacement('d', placement, committedShown).visible).toBe(false);
});

test('the layer mounts previewed tabs too, in a stable id order', () => {
    const placement = placeTabs(state, intoRight);
    expect(layerTabIds(['d', 'a'], placement)).toEqual(['a', 'b', 'd']);
    expect(layerTabIds(['d', 'a', 'gone'], placeTabs(state, null))).toEqual(['a', 'd']);
});

test('tabs riding in from another window show as a preview, never viewed before the drop', () => {
    // Adopted on band entry, the visiting tab is committed shown here, but only as a preview.
    const visiting: TabDragView = { ...intoRight, visiting: true };
    const adopted = drop(state, visiting);
    const placement = placeTabs(adopted, visiting);
    const viewable = viewableTabIds(placeTabs(adopted, null).shown, visiting);
    expect(framePlacement('a', placement, viewable)).toMatchObject({ shown: false, visible: true });
    // The drop clears the drag view: the landed tab counts from then on.
    const landed = placeTabs(adopted, null);
    expect(framePlacement('a', landed, viewableTabIds(landed.shown, null)).shown).toBe(true);
    // A tab dragged within its own window stays viewed.
    expect(viewableTabIds(['a', 'd'], intoRight)).toEqual(['a', 'd']);
});
