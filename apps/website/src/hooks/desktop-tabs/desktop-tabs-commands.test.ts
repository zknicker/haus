import { describe, expect, test } from 'bun:test';
import { tabsToRight } from './desktop-tabs-commands.ts';
import { currentLocation, newTabLocation } from './desktop-tabs-model.ts';
import { rowSelection } from './desktop-tabs-selection.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';

/** `primary: inbox a b c`, `a` shown, primary focused. */
function row() {
    return run(
        start(),
        ...['a', 'b', 'c'].map(
            (page) =>
                ({
                    intent: 'newTabAtEnd',
                    kind: 'openInFocusedPane',
                    location: app(page),
                    newId: page,
                }) as const
        ),
        { kind: 'select', tabId: 'a' }
    );
}

describe('new tab to the right', () => {
    test('opens the new tab page right after the tab, selected, its pane focused', () => {
        const state = run(split(), {
            afterTabId: 't0',
            kind: 'openAfter',
            location: newTabLocation,
            newId: 'n',
        });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox newTab*',
            secondary: 'tasks*',
        });
        const fromRight = run(split(), {
            afterTabId: 't1',
            kind: 'openAfter',
            location: newTabLocation,
            newId: 'n',
        });
        expect(describeTabs(fromRight).secondary).toBe('tasks newTab*');
        expect(fromRight.focusedPane).toBe('secondary');
    });

    test('ignores a tab that is gone', () => {
        const state = start();
        expect(run(state, { afterTabId: 'x', kind: 'openAfter', location: newTabLocation })).toBe(
            state
        );
    });
});

describe('duplicate', () => {
    test('copies a tab with its history right after it and shows the copy', () => {
        const base = run(
            start(),
            { kind: 'navigate', location: app('a'), mode: 'push', tabId: 't0' },
            { delta: -1, kind: 'go', tabId: 't0' }
        );
        const state = run(base, { kind: 'duplicate', newId: 'd', tabIds: ['t0'] });
        expect(state.primary?.tabIds).toEqual(['t0', 'd-0']);
        expect(state.primary?.selectedTabId).toBe('d-0');
        const copy = state.tabs['d-0'];
        expect(copy?.history.index).toBe(0);
        expect(copy?.history.entries.map((entry) => entry.location)).toEqual([
            app('inbox'),
            app('a'),
        ]);
        // Fresh entry keys: router keys never repeat across tabs.
        const keys = new Set(base.tabs.t0?.history.entries.map((entry) => entry.key));
        expect(copy?.history.entries.some((entry) => keys.has(entry.key))).toBe(false);
    });

    test('a web page reopens at the same address in a fresh view, one per source view', () => {
        const base = run(
            start(),
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: web('v1'), newId: 'w' },
            { kind: 'navigate', location: app('a'), mode: 'push', tabId: 'w' },
            { kind: 'navigate', location: web('v2'), mode: 'push', tabId: 'w' },
            {
                kind: 'navigate',
                location: web('v1', 'https://v1.example/next'),
                mode: 'push',
                tabId: 'w',
            }
        );
        const state = run(base, { kind: 'duplicate', newId: 'd', tabIds: ['w'] });
        const entries = state.tabs['d-0']?.history.entries ?? [];
        const views = entries.map((entry) =>
            entry.location.kind === 'browser' ? entry.location.viewId : null
        );
        expect(views).toEqual(['d-0-v0', null, 'd-0-v1', 'd-0-v0']);
        expect(currentLocation(state.tabs['d-0']!)).toMatchObject({
            url: 'https://v1.example/next',
        });
        // The source keeps its own live view.
        expect(currentLocation(state.tabs.w!)).toMatchObject({ viewId: 'v1' });
    });

    test('a selection duplicates as one block after its last tab, selected together', () => {
        const selected = run(row(), { gesture: 'toggle', kind: 'extendSelection', tabId: 'c' });
        const state = run(selected, { kind: 'duplicate', newId: 'd', tabIds: ['a', 'c'] });
        expect(state.primary?.tabIds).toEqual(['t0', 'a', 'b', 'c', 'd-0', 'd-1']);
        // `c` was shown (the toggle showed it), so its copy is.
        expect(state.primary?.selectedTabId).toBe('d-1');
        expect(state.primary ? rowSelection(state.primary) : []).toEqual(['d-0', 'd-1']);
    });
});

describe('close tabs to the right', () => {
    test('names the tabs after the rightmost target in its row', () => {
        const state = row();
        expect(tabsToRight(state, ['a'])).toEqual(['b', 'c']);
        expect(tabsToRight(state, ['b', 't0'])).toEqual(['c']);
        expect(tabsToRight(state, ['c'])).toEqual([]);
        expect(tabsToRight(state, [])).toEqual([]);
        expect(tabsToRight(split(), ['t0'])).toEqual([]);
    });
});
