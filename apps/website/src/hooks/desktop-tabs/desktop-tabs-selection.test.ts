import { describe, expect, test } from 'bun:test';
import type { DesktopTabsState } from './desktop-tabs-model.ts';
import { focusedSelection, selectionFor } from './desktop-tabs-selection.ts';
import { parseDesktopTabs, serializeDesktopTabs } from './desktop-tabs-storage.ts';
import { app, describeTabs, run, start } from './desktop-tabs-test-fixtures.ts';

/** One pane: t0 a b c d (ids t0 ta tb tc td), `shown` shown. */
function five(shown = 't0'): DesktopTabsState {
    return run(
        start(),
        ...['a', 'b', 'c', 'd'].map(
            (page) =>
                ({
                    intent: 'newTab',
                    kind: 'openInFocusedPane',
                    location: app(page),
                    newId: `t${page}`,
                }) as const
        ),
        { kind: 'select', tabId: shown }
    );
}

const toggle = (tabId: string) => ({ gesture: 'toggle', kind: 'extendSelection', tabId }) as const;
const range = (tabId: string) => ({ gesture: 'range', kind: 'extendSelection', tabId }) as const;
const addRange = (tabId: string) =>
    ({ gesture: 'addRange', kind: 'extendSelection', tabId }) as const;

function selection(state: DesktopTabsState) {
    const row = state.primary;
    return {
        active: row?.selectedTabId,
        anchor: row?.selection?.anchorTabId ?? row?.selectedTabId,
        ids: row?.selection?.tabIds ?? [row?.selectedTabId],
    };
}

describe('Chrome selection gestures', () => {
    test('Command-click adds a tab, which becomes active and the anchor', () => {
        expect(selection(run(five(), toggle('tb')))).toEqual({
            active: 'tb',
            anchor: 'tb',
            ids: ['t0', 'tb'],
        });
    });

    test('Command-click on a selected tab removes it; active and anchor fall to the first', () => {
        const state = run(five(), toggle('tb'), toggle('td'), toggle('td'));
        expect(selection(state)).toEqual({ active: 't0', anchor: 't0', ids: ['t0', 'tb'] });
        // The last selected tab stays: a row always has one.
        const single = run(five(), toggle('t0'));
        expect(selection(single)).toEqual({ active: 't0', anchor: 't0', ids: ['t0'] });
        expect(single.primary?.selection).toBeUndefined();
    });

    test('Command-click off a non-active tab keeps the active one', () => {
        const state = run(five(), toggle('tb'), toggle('td'), toggle('tb'));
        expect(selection(state)).toEqual({ active: 'td', anchor: 'td', ids: ['t0', 'td'] });
    });

    test('Shift-click selects the range from the anchor; the clicked tab is active, the anchor stays', () => {
        const state = run(five('ta'), range('tc'));
        expect(selection(state)).toEqual({ active: 'tc', anchor: 'ta', ids: ['ta', 'tb', 'tc'] });
        // A second Shift-click re-ranges from the same anchor, replacing the range.
        expect(selection(run(state, range('t0')))).toEqual({
            active: 't0',
            anchor: 'ta',
            ids: ['t0', 'ta'],
        });
    });

    test('Shift-Command-click adds the anchor range to the selection', () => {
        const state = run(five(), toggle('tc'), addRange('td'));
        expect(selection(state)).toEqual({ active: 'td', anchor: 'tc', ids: ['t0', 'tc', 'td'] });
    });

    test('a plain click (or any activation) collapses the selection', () => {
        const state = run(five(), range('tc'), { kind: 'select', tabId: 'tb' });
        expect(selection(state)).toEqual({ active: 'tb', anchor: 'tb', ids: ['tb'] });
    });

    test('a gesture in the other pane starts its own selection there and collapses this one', () => {
        const split = run(five(), range('tb'), {
            kind: 'move',
            tabIds: ['td'],
            to: { index: 0, pane: 'secondary' },
        });
        const state = run(
            split,
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('e'), newId: 'te' },
            { kind: 'select', tabId: 't0' },
            range('tb'),
            // The secondary row shows te; Command-click adds td to that row's own selection.
            toggle('td')
        );
        expect(state.primary?.selection).toBeUndefined();
        expect(state.focusedPane).toBe('secondary');
        expect(state.secondary?.selection?.tabIds).toEqual(['td', 'te']);
    });

    test('commands act on the selection when the tab is in it, else on that tab alone', () => {
        const state = run(five(), range('tb'));
        expect(selectionFor(state, 'ta')).toEqual(['t0', 'ta', 'tb']);
        expect(selectionFor(state, 'td')).toEqual(['td']);
        expect(focusedSelection(state)).toEqual(['t0', 'ta', 'tb']);
    });
});

describe('closing and reopening a selection', () => {
    test('⌘W closes every selected tab; ⌘⇧T reopens them one by one, each where it was', () => {
        const state = run(five(), toggle('ta'), toggle('tc'));
        const closed = run(state, { kind: 'close', tabIds: focusedSelection(state) });
        expect(describeTabs(closed).primary).toBe('b d*');
        expect(closed.closed).toHaveLength(3);
        const once = run(closed, { kind: 'reopenClosed' });
        expect(describeTabs(once).primary).toBe('inbox* b d');
        const all = run(once, { kind: 'reopenClosed' }, { kind: 'reopenClosed' });
        expect(describeTabs(all).primary).toBe('inbox a b c* d');
    });

    test('closing every tab empties the window', () => {
        const state = run(five(), range('td'));
        expect(run(state, { kind: 'close', tabIds: focusedSelection(state) }).primary).toBeNull();
    });

    test('closing a tab outside the selection keeps the selection', () => {
        const state = run(five(), range('tb'), { kind: 'close', tabIds: ['td'] });
        expect(selection(state).ids).toEqual(['t0', 'ta', 'tb']);
    });
});

describe('moving a selection', () => {
    test('dragged tabs gather side by side at the slot and stay selected', () => {
        const state = run(five(), toggle('tb'), toggle('td'), {
            kind: 'move',
            tabIds: ['t0', 'tb', 'td'],
            to: { index: 1, pane: 'primary' },
        });
        expect(describeTabs(state).primary).toBe('a inbox b d* c');
        expect(selection(state)).toEqual({ active: 'td', anchor: 'td', ids: ['t0', 'tb', 'td'] });
    });

    test('into the other pane: the source shows a neighbor, the target the moved active tab', () => {
        const state = run(five('tb'), range('tc'), {
            kind: 'move',
            tabIds: ['tb', 'tc'],
            to: { index: 0, pane: 'secondary' },
        });
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox a d*',
            secondary: 'b c*',
        });
        expect(state.secondary?.selection?.tabIds).toEqual(['tb', 'tc']);
    });
});

test('a multi-selection is not persisted: a reload shows only the shown tab', () => {
    const state = run(five(), range('tb'));
    const restored = parseDesktopTabs(serializeDesktopTabs(state), app('inbox'), {
        entryKey: 'x',
        tabId: 'x',
    });
    expect(restored.primary?.selection).toBeUndefined();
    expect(restored.primary?.selectedTabId).toBe('tb');
});
