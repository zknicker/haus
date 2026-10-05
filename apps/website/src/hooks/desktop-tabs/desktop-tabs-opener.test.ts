import { describe, expect, test } from 'bun:test';
import type { DesktopTabsState } from './desktop-tabs-model.ts';
import { newTabLocation } from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';

/** `inbox* x y`: the opener first, two tabs after it, no opener run. */
function row(): DesktopTabsState {
    return run(
        start(),
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('x'), newId: 'x' },
        { intent: 'newTab', kind: 'openInFocusedPane', location: app('y'), newId: 'y' },
        { kind: 'select', tabId: 't0' }
    );
}

function link(
    location: ReturnType<typeof app>,
    newId: string,
    fromTabId = 't0',
    intent: 'backgroundTab' | 'newTab' = 'backgroundTab'
) {
    return { fromTabId, intent, kind: 'openLink' as const, location, newId };
}

describe("Chrome's opener rule", () => {
    test('in-page links and chips: Command-clicks stack in order after the opener', () => {
        const state = run(row(), link(app('a'), 'a'), link(app('b'), 'b'), link(app('c'), 'c'));
        expect(describeTabs(state).primary).toBe('inbox* a b c x y');
    });

    test('selecting another tab ends the run; the next open lands right after its opener', () => {
        const state = run(
            row(),
            link(app('a'), 'a'),
            link(app('b'), 'b'),
            { kind: 'select', tabId: 'y' },
            { kind: 'select', tabId: 't0' },
            link(app('c'), 'c')
        );
        expect(describeTabs(state).primary).toBe('inbox* c a b x y');
    });

    test('a different opener starts its own run', () => {
        const state = run(row(), link(app('a'), 'a'), link(app('b'), 'b', 'x'));
        expect(describeTabs(state).primary).toBe('inbox* a x b y');
    });

    test('a moved tab breaks the run', () => {
        const state = run(
            row(),
            link(app('a'), 'a'),
            { kind: 'move', tabIds: ['a'], to: { index: 3, pane: 'primary' } },
            link(app('b'), 'b')
        );
        expect(describeTabs(state).primary).toBe('inbox b x y a*');
    });

    test('sidebar Shift-click: a selected tab after the current one, stacking', () => {
        const state = run(
            row(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('a') },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('b') }
        );
        expect(describeTabs(state).primary).toBe('inbox a b* x y');
    });

    test('sidebar and command menu Command-click: background tabs stack after the current one', () => {
        const state = run(
            row(),
            { intent: 'backgroundTab', kind: 'openInFocusedPane', location: app('a') },
            { intent: 'backgroundTab', kind: 'openInFocusedPane', location: app('b') }
        );
        expect(describeTabs(state).primary).toBe('inbox* a b x y');
        expect(state.focusedPane).toBe('primary');
    });

    test('web links from the App and from a web page stack after their opener', () => {
        const fromApp = run(
            row(),
            link(web('v1'), 'v1', 't0', 'newTab'),
            link(web('v2'), 'v2', 't0', 'newTab')
        );
        expect(describeTabs(fromApp).primary).toBe('inbox web:v1 web:v2* x y');
        const page = run(
            row(),
            { kind: 'navigate', location: web('p'), mode: 'push', newId: 'e1', tabId: 't0' },
            link(web('v1'), 'v1', 't0', 'newTab'),
            link(web('v2'), 'v2', 't0', 'newTab')
        );
        expect(describeTabs(page).primary).toBe('web:p web:v1 web:v2* x y');
    });

    test('two panes: a Command-click stays beside its source, stacking', () => {
        const state = run(
            split(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('x'), newId: 'x' },
            { kind: 'select', tabId: 't0' },
            link(app('a'), 'a'),
            link(app('b'), 'b')
        );
        expect(describeTabs(state)).toMatchObject({ primary: 'inbox* a b x', secondary: 'tasks*' });
    });

    test('two panes: web links stack after the other pane’s current tab', () => {
        const base = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('z'), newId: 'z' },
            { kind: 'select', tabId: 't1' },
            { kind: 'select', tabId: 't0' }
        );
        expect(describeTabs(base).secondary).toBe('tasks* z');
        const state = run(
            base,
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: web('v1') },
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: web('v2') }
        );
        // The first web tab is selected, so the second follows it: still in open order.
        expect(describeTabs(state).secondary).toBe('tasks web:v1 web:v2* z');
    });

    test('⌘T still opens at the end of the row', () => {
        const state = run(row(), link(app('a'), 'a'), {
            intent: 'newTabAtEnd',
            kind: 'openInFocusedPane',
            location: newTabLocation,
        });
        expect(describeTabs(state).primary).toBe('inbox a x y newTab*');
    });
});
