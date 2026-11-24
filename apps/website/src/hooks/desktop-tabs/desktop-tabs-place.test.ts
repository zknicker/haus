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

    test('a Go to the address the left pane’s tab already shows adds no history entry', () => {
        const state = run(start(), go('chats/a'), go('chats/a'));
        expect(state.tabs.t0?.history.entries.map((entry) => entry.location)).toEqual([
            app('inbox'),
            app('chats/a'),
        ]);
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

    test('no per-kind exceptions: a Task, an Agent, a web page tab all just navigate', () => {
        const fromWeb = run(
            start(),
            { kind: 'navigate', location: web('v1'), mode: 'push', tabId: 't0' },
            go('agents/a1'),
            go('tasks/SEC-1')
        );
        expect(describeTabs(fromWeb)).toMatchObject({
            primary: 'tasks/SEC-1*',
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

describe('Settings is a page, as in Capy and Linear', () => {
    test('pushes onto the left pane’s selected tab, focusing it; Back returns', () => {
        const state = run(split(), { kind: 'focusPane', pane: 'secondary' }, settings());
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'settings*',
            secondary: 'tasks*',
        });
        expect(describeTabs(run(state, { delta: -1, kind: 'go', tabId: 't0' })).primary).toBe(
            'inbox*'
        );
    });

    test('a tab already in Settings keeps its section; a deeper address is pushed', () => {
        const base = run(start(), go('settings/members'));
        const state = run(base, settings());
        expect(describeTabs(state).primary).toBe('settings/members*');
        expect(state.tabs.t0?.history.entries).toHaveLength(2);
        const deeper = run(base, settings('settings/connections'));
        expect(describeTabs(deeper).primary).toBe('settings/connections*');
        expect(deeper.tabs.t0?.history.entries).toHaveLength(3);
    });
});
