import { describe, expect, test } from 'bun:test';
import { desktopTabsReducer } from '../../hooks/desktop-tabs/desktop-tabs-reducer.ts';
import {
    app,
    describeTabs,
    run,
    split,
    start,
} from '../../hooks/desktop-tabs/desktop-tabs-test-fixtures.ts';
import { tabPaneMove } from './workspace-tab-move.ts';

describe('the tab menu pane move', () => {
    test('with one pane, Move to right pane opens the second pane', () => {
        const state = run(start(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: app('tasks'),
        });
        for (const tabId of state.primary?.tabIds ?? []) {
            expect(tabPaneMove(state, [tabId])?.label).toBe('Move to right pane');
        }
        const move = tabPaneMove(state, ['t0']);
        const moved = move
            ? desktopTabsReducer(state, { kind: 'move', tabIds: ['t0'], to: move.to })
            : state;
        expect(describeTabs(moved)).toEqual({
            focused: 'secondary',
            primary: 'tasks*',
            secondary: 'inbox*',
        });
    });

    test('a window with one tab offers no move', () => {
        expect(tabPaneMove(start(), ['t0'])).toBeNull();
    });

    test('with two panes each side moves to the other; moving the last left tab collapses', () => {
        const state = split();
        expect(tabPaneMove(state, ['t0'])?.label).toBe('Move to right pane');
        const left = tabPaneMove(state, ['t1']);
        expect(left?.label).toBe('Move to left pane');
        const moved = left
            ? desktopTabsReducer(state, { kind: 'move', tabIds: ['t1'], to: left.to })
            : state;
        expect(describeTabs(moved)).toEqual({
            focused: 'primary',
            primary: 'inbox tasks*',
            secondary: '-',
        });
        const toRight = tabPaneMove(state, ['t0']);
        const collapsed = toRight
            ? desktopTabsReducer(state, { kind: 'move', tabIds: ['t0'], to: toRight.to })
            : state;
        expect(describeTabs(collapsed)).toEqual({
            focused: 'primary',
            primary: 'tasks inbox*',
            secondary: '-',
        });
    });

    test('a multi-selection moves together and stays selected in the other pane', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('a'), newId: 'ta' },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('b'), newId: 'tb' },
            { gesture: 'range', kind: 'extendSelection', tabId: 'ta' }
        );
        const ids = state.primary?.selection?.tabIds ?? [];
        expect(ids).toEqual(['ta', 'tb']);
        const move = tabPaneMove(state, ids);
        expect(move?.label).toBe('Move tabs to right pane');
        const moved = move
            ? desktopTabsReducer(state, { kind: 'move', tabIds: ids, to: move.to })
            : state;
        expect(describeTabs(moved)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'a* b',
        });
        expect(moved.secondary?.selection?.tabIds).toEqual(ids);
        // Every tab of a one-pane window has nowhere to go.
        expect(tabPaneMove(state, state.primary?.tabIds ?? [])).toBeNull();
    });
});
