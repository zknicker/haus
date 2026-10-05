import { describe, expect, test } from 'bun:test';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';

// The place rule (ADR 0039): sidebar, command menu, notifications, deep links.
describe('openInFocusedPane and reveal', () => {
    test('the sidebar navigates an app page in the focused pane current tab, and Back returns', () => {
        const state = run(start(), {
            intent: 'current',
            kind: 'openInFocusedPane',
            location: app('chats/a'),
        });
        expect(describeTabs(state).primary).toBe('chats/a*');
        const back = run(state, { delta: -1, kind: 'go', tabId: 't0' });
        expect(describeTabs(back).primary).toBe('inbox*');
    });

    test('the sidebar never replaces a web page: the place opens as a selected tab after it', () => {
        let state = run(split(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: web('v1'),
        });
        state = run(state, { kind: 'focusPane', pane: 'secondary' });
        state = run(state, {
            intent: 'current',
            kind: 'openInFocusedPane',
            location: app('chats/a'),
        });
        expect(describeTabs(state)).toMatchObject({
            focused: 'secondary',
            secondary: 'tasks web:v1 chats/a*',
        });
        const webTab = state.secondary?.tabIds[1] ?? '';
        expect(state.tabs[webTab]?.history.entries).toHaveLength(1);
    });

    test('the sidebar selects a tab already on that page, in either pane, adding nothing', () => {
        const state = run(split(), {
            intent: 'current',
            kind: 'openInFocusedPane',
            location: app('tasks'),
        });
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks*',
        });
        expect(state.tabs.t1?.history.entries).toHaveLength(1);
    });

    test('the sidebar selects a hidden tab on that page in the focused pane', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('chats/a') },
            { intent: 'current', kind: 'openInFocusedPane', location: app('inbox') }
        );
        expect(describeTabs(state).primary).toBe('inbox* chats/a');
        expect(state.tabs.t0?.history.entries).toHaveLength(1);
    });

    test('Command-click on the sidebar opens a new tab even when the page is open', () => {
        const state = run(split(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: app('tasks'),
        });
        expect(describeTabs(state)).toMatchObject({ primary: 'inbox tasks*', secondary: 'tasks*' });
    });

    test('a sidebar click on the page already shown adds no history', () => {
        const state = run(start(), {
            intent: 'current',
            kind: 'openInFocusedPane',
            location: app('inbox'),
        });
        expect(state.tabs.t0?.history.entries).toHaveLength(1);
    });

    test('⌘T opens a selected tab after the current one', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('tasks') },
            { kind: 'select', tabId: 't0' },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('inbox') }
        );
        expect(describeTabs(state).primary).toBe('inbox inbox* tasks');
    });

    test('reveal selects an existing tab in either pane', () => {
        const state = run(split(), { kind: 'reveal', location: app('tasks') });
        expect(describeTabs(state).focused).toBe('secondary');
        expect(Object.keys(state.tabs)).toHaveLength(2);
    });

    test('reveal drills into the same page with the new address', () => {
        const state = run(split(), { kind: 'reveal', location: app('tasks?task=9') });
        expect(describeTabs(state).secondary).toBe('tasks?task=9*');
    });

    test('reveal without a match navigates the focused pane current tab', () => {
        const state = run(split(), { kind: 'reveal', location: app('chats/z') });
        expect(describeTabs(state)).toMatchObject({ primary: 'chats/z*', secondary: 'tasks*' });
    });

    test('reveal on a web page opens the place as a new tab after it', () => {
        const state = run(
            start(),
            { kind: 'navigate', location: web('v1'), mode: 'push', tabId: 't0' },
            { kind: 'reveal', location: app('chats/z') }
        );
        expect(describeTabs(state).primary).toBe('web:v1 chats/z*');
    });
});
