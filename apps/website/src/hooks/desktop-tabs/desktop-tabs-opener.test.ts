import { describe, expect, test } from 'bun:test';
import type { DesktopTabsState, TabLocation } from './desktop-tabs-model.ts';
import { newTabLocation } from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';

/** `inbox* x y`: the opener first, two tabs after it, no opener run. */
function row(): DesktopTabsState {
    return run(start(), tab(app('x'), null, false, 'x'), tab(app('y'), null, false, 'y'), {
        kind: 'select',
        tabId: 't0',
    });
}

/** A modified click: `fromTabId` null is the sidebar or command menu. */
function tab(
    location: TabLocation,
    fromTabId: string | null = 't0',
    background = true,
    newId?: string
) {
    return {
        background,
        fromTabId,
        kind: 'openTab' as const,
        location,
        ...(newId ? { newId } : {}),
    };
}

describe("Chrome's opener rule for modified clicks", () => {
    test('in-page Command-clicks stack in order after the opener, in the background', () => {
        const state = run(row(), tab(app('a')), tab(app('b')), tab(app('c')));
        expect(describeTabs(state).primary).toBe('inbox* a b c x y');
    });

    test('selecting another tab ends the run; the next open lands right after its opener', () => {
        const state = run(
            row(),
            tab(app('a')),
            tab(app('b')),
            { kind: 'select', tabId: 'y' },
            { kind: 'select', tabId: 't0' },
            tab(app('c'))
        );
        expect(describeTabs(state).primary).toBe('inbox* c a b x y');
    });

    test('Open selecting an existing right-pane tab ends the run too', () => {
        const state = run(
            split(),
            { fromTabId: 't0', kind: 'open', location: app('chats/a'), newId: 'r' },
            tab(app('a')),
            { fromTabId: 't0', kind: 'open', location: app('chats/a') },
            tab(app('b'))
        );
        expect(describeTabs(state).primary).toBe('inbox* b a');
    });

    test('a different opener starts its own run', () => {
        const state = run(row(), tab(app('a')), tab(app('b'), 'x'));
        expect(describeTabs(state).primary).toBe('inbox* a x b y');
    });

    test('a moved tab breaks the run', () => {
        const state = run(
            row(),
            tab(app('a'), 't0', true, 'a'),
            { kind: 'move', tabIds: ['a'], to: { index: 3, pane: 'primary' } },
            tab(app('b'))
        );
        expect(describeTabs(state).primary).toBe('inbox b x y a*');
    });

    test('Shift: a selected tab after the source, its pane focused, stacking', () => {
        const state = run(row(), tab(app('a'), null, false), tab(app('b'), null, false));
        expect(describeTabs(state).primary).toBe('inbox a b* x y');
    });

    test('sidebar and command menu: after the left pane’s selected tab even with the right focused', () => {
        const state = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            tab(app('a'), null),
            tab(app('b'), null)
        );
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox* a b',
            secondary: 'tasks*',
        });
    });

    test('a modified click on a Thread opens beside its source, not on the right', () => {
        const state = run(start(), tab(app('threads/c1/m1')));
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox* threads/c1/m1',
            secondary: '-',
        });
    });

    test('a modified click from the right pane stays in the right pane', () => {
        const state = run(split(), tab(app('a'), 't1'), tab(app('b'), 't1'));
        expect(describeTabs(state)).toMatchObject({ primary: 'inbox*', secondary: 'tasks* a b' });
    });

    test('never dedupes: a page already open gets another tab', () => {
        const state = run(split(), tab(app('tasks')));
        expect(describeTabs(state).primary).toBe('inbox* tasks');
    });

    test('background web links stack after their source', () => {
        const state = run(row(), tab(web('v1')), tab(web('v2')));
        expect(describeTabs(state).primary).toBe('inbox* web:v1 web:v2 x y');
    });

    test('⌘T still opens at the end of the row', () => {
        const state = run(row(), tab(app('a')), { kind: 'openNewTab', location: newTabLocation });
        expect(describeTabs(state).primary).toBe('inbox a x y newTab*');
    });
});
