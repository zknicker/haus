import { describe, expect, test } from 'bun:test';
import { currentLocation, newTabLocation } from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';

const go = (page: string) => ({ kind: 'goTo', location: app(page) }) as const;
const settings = (page = 'settings') => ({ kind: 'openSettings', location: app(page) }) as const;

describe('Go: sidebar rows and the command menu (ADR 0039)', () => {
    test('navigates the left pane’s selected tab in place; Back undoes it', () => {
        const state = run(start(), go('chats/a'));
        expect(describeTabs(state).primary).toBe('chats/a*');
        expect(state.tabs.t0?.history.entries).toHaveLength(2);
        expect(describeTabs(run(state, { delta: -1, kind: 'go', tabId: 't0' })).primary).toBe(
            'inbox*'
        );
    });

    test('targets the left pane even when the right pane is focused, and focuses the left', () => {
        const state = run(split(), { kind: 'focusPane', pane: 'secondary' }, go('chats/a'));
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'chats/a*',
            secondary: 'tasks*',
        });
    });

    test('right pane focused and showing #x: a sidebar click on #x navigates the left pane to #x', () => {
        const state = run(
            split(),
            { kind: 'navigate', location: app('chats/x'), mode: 'push', tabId: 't1' },
            { kind: 'focusPane', pane: 'secondary' },
            go('chats/x')
        );
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'chats/x*',
            secondary: 'chats/x*',
        });
    });

    test('never dedupes: a page another tab shows is navigated to, not jumped to', () => {
        const state = run(split(), go('tasks'));
        expect(describeTabs(state)).toMatchObject({ primary: 'tasks*', secondary: 'tasks*' });
        expect(state.primary?.tabIds).toEqual(['t0']);
    });

    test('no per-kind exceptions: a Thread, an Agent, a web page tab all just navigate', () => {
        const fromWeb = run(
            start(),
            { kind: 'navigate', location: web('v1'), mode: 'push', tabId: 't0' },
            go('agents/a1'),
            go('threads/c1/m1')
        );
        expect(describeTabs(fromWeb)).toMatchObject({
            primary: 'threads/c1/m1*',
            secondary: '-',
        });
        const back = run(fromWeb, { delta: -2, kind: 'go', tabId: 't0' });
        expect(back.tabs.t0 && currentLocation(back.tabs.t0)).toEqual(web('v1'));
    });

    test('a new tab page becomes the page', () => {
        const state = run(start(), { kind: 'openNewTab', location: newTabLocation }, go('chats/a'));
        expect(describeTabs(state).primary).toBe('inbox chats/a*');
    });
});

describe('Settings is a singleton', () => {
    test('opens as a new selected tab in the left pane after its selected tab', () => {
        const state = run(split(), { kind: 'focusPane', pane: 'secondary' }, settings());
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox settings*',
            secondary: 'tasks*',
        });
    });

    test('selects an existing Settings tab anywhere in the window, focusing its pane', () => {
        const base = run(
            split(),
            { fromTabId: 't0', kind: 'open', location: app('settings/members'), newId: 's' },
            { kind: 'select', tabId: 't1' },
            { kind: 'focusPane', pane: 'primary' }
        );
        const state = run(base, settings());
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks settings/members*',
        });
        // ⌘, keeps the section you were on; a deeper address is pushed.
        expect(state.tabs.s?.history.entries).toHaveLength(1);
        const deeper = run(base, settings('settings/connections'));
        expect(describeTabs(deeper).secondary).toBe('tasks settings/connections*');
    });
});
