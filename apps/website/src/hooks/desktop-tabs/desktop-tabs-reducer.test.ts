import { describe, expect, test } from 'bun:test';
import {
    closedTabLimit,
    currentLocation,
    shownTabIds,
    tabHistoryLimit,
} from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start } from './desktop-tabs-test-fixtures.ts';
import { mountedTabIds } from './use-desktop-tabs-controller.ts';

const push = (page: string) =>
    ({ kind: 'navigate', location: app(page), mode: 'push', tabId: 't0' }) as const;

describe('history', () => {
    test('push truncates forward entries; replace swaps the current one', () => {
        let state = run(start(), push('a'), push('b'), { delta: -1, kind: 'go', tabId: 't0' });
        state = run(state, push('c'));
        expect(state.tabs.t0?.history.entries.map((entry) => entry.location)).toEqual([
            app('inbox'),
            app('a'),
            app('c'),
        ]);
        state = run(state, { ...push('d'), mode: 'replace' });
        expect(state.tabs.t0?.history.entries).toHaveLength(3);
        expect(currentLocation(state.tabs.t0!)).toEqual(app('d'));
    });

    test(`history keeps the newest ${tabHistoryLimit} entries`, () => {
        const pushes = Array.from({ length: tabHistoryLimit + 5 }, (_, index) => push(`p${index}`));
        const history = run(start(), ...pushes).tabs.t0?.history;
        expect(history?.entries).toHaveLength(tabHistoryLimit);
        expect(history?.index).toBe(tabHistoryLimit - 1);
    });

    test('out-of-range go is ignored', () => {
        const state = start();
        expect(run(state, { delta: -1, kind: 'go', tabId: 't0' })).toBe(state);
        expect(run(state, { delta: 1, kind: 'go', tabId: 't0' })).toBe(state);
    });

    test('savePageState merges into the current entry only', () => {
        const state = run(start(), push('a'), {
            kind: 'savePageState',
            pageState: { scrollTop: 40 },
            tabId: 't0',
        });
        expect(state.tabs.t0?.history.entries.map((entry) => entry.pageState)).toEqual([
            {},
            { scrollTop: 40 },
        ]);
    });
});

describe('close and reopen', () => {
    test('closing a selection falls to its right neighbor, else its left', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('a') },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('b') },
            { kind: 'select', tabId: 't0' }
        );
        const afterFirst = run(state, { kind: 'close', tabIds: ['t0'] });
        expect(describeTabs(afterFirst).primary).toBe('a* b');
        const lastSelected = run(state, { kind: 'select', tabId: state.primary?.tabIds[2] ?? '' });
        expect(
            describeTabs(
                run(lastSelected, {
                    kind: 'close',
                    tabIds: [lastSelected.primary?.selectedTabId ?? ''],
                })
            ).primary
        ).toBe('inbox a*');
    });

    test('closing a pane last tab collapses it; an empty primary promotes the secondary', () => {
        expect(describeTabs(run(split(), { kind: 'close', tabIds: ['t1'] }))).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: '-',
        });
        const promoted = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            { kind: 'close', tabIds: ['t0'] }
        );
        expect(describeTabs(promoted)).toEqual({
            focused: 'primary',
            primary: 'tasks*',
            secondary: '-',
        });
    });

    test('closing the last tab leaves primary null', () => {
        const state = run(start(), { kind: 'close', tabIds: ['t0'] });
        expect(state.primary).toBeNull();
        expect(state.mru).toEqual([]);
    });

    test('reopen restores the tab with its history into its pane and index', () => {
        let state = run(split(), {
            kind: 'navigate',
            location: app('chats/a'),
            mode: 'push',
            tabId: 't1',
        });
        state = run(state, { kind: 'close', tabIds: ['t1'] });
        expect(state.secondary).toBeNull();
        state = run(state, { kind: 'reopenClosed' });
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'chats/a*',
        });
        expect(state.tabs.t1?.history.entries).toHaveLength(2);
        expect(state.closed).toEqual([]);
    });

    test(`closed tabs keep the newest ${closedTabLimit}`, () => {
        const opens = Array.from({ length: closedTabLimit + 3 }, (_, index) => ({
            intent: 'newTab' as const,
            kind: 'openInFocusedPane' as const,
            location: app(`p${index}`),
        }));
        let state = run(start(), ...opens);
        for (const id of [...(state.primary?.tabIds ?? [])].slice(1)) {
            state = run(state, { kind: 'close', tabIds: [id] });
        }
        expect(state.closed).toHaveLength(closedTabLimit);
    });
});

describe('move and focus', () => {
    test('reorders within a row and selects the moved tab', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('a') },
            { kind: 'move', tabIds: ['t0'], to: { index: 1, pane: 'primary' } }
        );
        expect(describeTabs(state).primary).toBe('a inbox*');
    });

    test('moves between rows, and moving to the right pane opens it', () => {
        const two = run(start(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: app('a'),
        });
        const opened = run(two, {
            kind: 'move',
            tabIds: ['t0'],
            to: { index: 0, pane: 'secondary' },
        });
        expect(describeTabs(opened)).toEqual({
            focused: 'secondary',
            primary: 'a*',
            secondary: 'inbox*',
        });
        expect(
            run(start(), { kind: 'move', tabIds: ['t0'], to: { index: 0, pane: 'secondary' } })
        ).toEqual(start());
        const merged = run(split(), {
            kind: 'move',
            tabIds: ['t0'],
            to: { index: 1, pane: 'secondary' },
        });
        expect(describeTabs(merged)).toEqual({
            focused: 'primary',
            primary: 'tasks inbox*',
            secondary: '-',
        });
    });

    test('closing the right pane last tab collapses to one pane', () => {
        const state = run(split(), { kind: 'close', tabIds: ['t1'] });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: '-',
        });
        expect(shownTabIds(state)).toEqual(['t0']);
    });

    test('focusPane ignores a missing pane', () => {
        const state = start();
        expect(run(state, { kind: 'focusPane', pane: 'secondary' })).toBe(state);
    });
});

describe('mru and mounting', () => {
    test('shown tabs lead the MRU and the mount set stays bounded', () => {
        const opens = Array.from({ length: 8 }, (_, index) => ({
            intent: 'newTab' as const,
            kind: 'openInFocusedPane' as const,
            location: app(`p${index}`),
        }));
        const state = run(split(), ...opens);
        const shown = shownTabIds(state);
        expect(state.mru.slice(0, 2).sort()).toEqual([...shown].sort());
        expect(state.mru).toHaveLength(10);
        expect(mountedTabIds(state, shown)).toHaveLength(5);
    });
});
