import { expect, test } from 'bun:test';
import type {
    DesktopTabsState,
    PaneState,
} from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { projectRow, slotOfTab, slotTarget } from './tab-drag-projection.ts';

function windowTabs(primary: string[], secondary: string[] | null): DesktopTabsState {
    const pane = (ids: string[]): PaneState => ({ selectedTabId: ids[0] ?? '', tabIds: ids });
    return {
        closed: [],
        focusedPane: 'primary',
        mru: [],
        primary: pane(primary),
        secondary: secondary ? pane(secondary) : null,
        tabs: {},
    };
}

test('a dragged tab leaves its row and sits at its slot in the row under the pointer', () => {
    const state = windowTabs(['a', 'b', 'c'], ['d', 'e']);
    const drag = { slot: { index: 1, row: 'secondary' as const }, tabIds: ['a'] };
    expect(projectRow(state, 'primary', drag)).toEqual(['b', 'c']);
    expect(projectRow(state, 'secondary', drag)).toEqual(['d', 'a', 'e']);
    expect(projectRow(state, 'primary', null)).toEqual(['a', 'b', 'c']);
});

test('a slot resolves to a move, or null where the tab already is', () => {
    const state = windowTabs(['a', 'b', 'c'], ['d']);
    expect(slotOfTab(state, 'b')).toEqual({ index: 1, row: 'primary' });
    expect(slotTarget(state, ['b'], { index: 1, row: 'primary' })).toBeNull();
    expect(slotTarget(state, ['a'], { index: 2, row: 'primary' })).toEqual({
        index: 2,
        pane: 'primary',
    });
    expect(slotTarget(state, ['a'], { index: 0, row: 'secondary' })).toEqual({
        index: 0,
        pane: 'secondary',
    });
    // A tab arriving from another window always lands.
    expect(slotTarget(state, ['x'], { index: 9, row: 'secondary' })).toEqual({
        index: 1,
        pane: 'secondary',
    });
});

test('a dragged selection gathers side by side at its slot, around the pressed tab', () => {
    const state = windowTabs(['a', 'b', 'c', 'd'], ['e']);
    // b and d selected, b pressed: the block starts where b was among the others.
    expect(slotOfTab(state, 'b', ['b', 'd'])).toEqual({ index: 1, row: 'primary' });
    const drag = { slot: { index: 1, row: 'primary' as const }, tabIds: ['b', 'd'] };
    expect(projectRow(state, 'primary', drag)).toEqual(['a', 'b', 'd', 'c']);
    // Dropped there it still gathers; already side by side in place, it is a no-op.
    expect(slotTarget(state, ['b', 'd'], drag.slot)).toEqual({ index: 1, pane: 'primary' });
    expect(slotTarget(state, ['b', 'c'], { index: 1, row: 'primary' })).toBeNull();
    expect(slotTarget(state, ['b', 'c'], { index: 0, row: 'secondary' })).toEqual({
        index: 0,
        pane: 'secondary',
    });
});
