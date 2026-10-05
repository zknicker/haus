import { describe, expect, test } from 'bun:test';
import { newTabLocation } from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';
import { openNewTabPage } from './use-desktop-tab-shortcuts.ts';

describe('openLink (ADR 0039 placement)', () => {
    test('one pane: a link navigates the current tab and never opens a second pane', () => {
        const state = run(start(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('chats/a'),
        });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'chats/a*',
            secondary: '-',
        });
        expect(state.tabs.t0?.history.entries).toHaveLength(2);
    });

    test('two panes: a link navigates the other pane, and Back returns', () => {
        const state = run(split(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('search'),
        });
        expect(describeTabs(state).secondary).toBe('search*');
        expect(state.tabs.t1?.history.entries).toHaveLength(2);
        const back = run(state, { delta: -1, kind: 'go', tabId: 't1' });
        expect(describeTabs(back).secondary).toBe('tasks*');
    });

    test('two panes: an already-open page in the other pane is selected, not duplicated', () => {
        let state = run(split(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: app('chats/a'),
        });
        state = run(state, { kind: 'focusPane', pane: 'secondary' });
        state = run(state, {
            fromTabId: 't1',
            intent: 'auto',
            kind: 'openLink',
            location: app('inbox'),
        });
        expect(describeTabs(state).primary).toBe('inbox* chats/a');
        expect(Object.keys(state.tabs)).toHaveLength(3);
    });

    test('one pane: a link to a page open in another tab selects that tab', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('chats/a') },
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: app('chats/a') }
        );
        expect(describeTabs(state).primary).toBe('inbox chats/a*');
        expect(state.tabs.t0?.history.entries).toHaveLength(1);
    });

    test('two panes: a link never replaces a web page in the other pane', () => {
        let state = run(split(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: web('v1'),
        });
        state = run(state, {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('chats/a'),
        });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: 'tasks web:v1 chats/a*',
        });
    });

    test('two panes: a link to a page open only in its own pane still goes to the other pane', () => {
        const state = run(
            split(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('chats/a') },
            { kind: 'select', tabId: 't0' },
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: app('chats/a') }
        );
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox* chats/a',
            secondary: 'chats/a*',
        });
    });

    test('a link from the secondary pane lands in the primary', () => {
        const state = run(split(), {
            fromTabId: 't1',
            intent: 'auto',
            kind: 'openLink',
            location: app('chats/b'),
        });
        expect(describeTabs(state)).toMatchObject({ primary: 'chats/b*', secondary: 'tasks*' });
    });

    test('intent here stays in the tab even with two panes', () => {
        const state = run(split(), {
            fromTabId: 't0',
            intent: 'here',
            kind: 'openLink',
            location: app('agents/x'),
        });
        expect(describeTabs(state)).toMatchObject({ primary: 'agents/x*', secondary: 'tasks*' });
    });

    test('Command- or middle-click opens a background tab after the source, same pane', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('tasks') },
            { kind: 'select', tabId: 't0' },
            {
                fromTabId: 't0',
                intent: 'backgroundTab',
                kind: 'openLink',
                location: app('chats/a'),
            }
        );
        expect(describeTabs(state).primary).toBe('inbox* chats/a tasks');
    });

    test('Shift- or Command-Shift-click opens a selected tab after the source', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('tasks') },
            { kind: 'select', tabId: 't0' },
            { fromTabId: 't0', intent: 'newTab', kind: 'openLink', location: app('chats/a') }
        );
        expect(describeTabs(state).primary).toBe('inbox chats/a* tasks');
    });

    test('web links always open a new selected tab: the other pane when there are two', () => {
        const state = run(split(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: web('v1'),
        });
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox*',
            secondary: 'tasks web:v1*',
        });
    });

    test('web links with one pane open a selected tab beside the source', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('tasks') },
            { kind: 'select', tabId: 't0' },
            { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: web('v1') }
        );
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox web:v1* tasks',
            secondary: '-',
        });
    });

    test('a background web link stays unselected, placed by the opener rule', () => {
        const background = (url: string) => ({
            fromTabId: 't0',
            intent: 'backgroundTab' as const,
            kind: 'openLink' as const,
            location: web(url),
            newId: url,
        });
        const one = run(start(), background('v1'), background('v2'));
        expect(describeTabs(one).primary).toBe('inbox* web:v1 web:v2');
        const two = run(split(), background('v1'));
        expect(describeTabs(two)).toMatchObject({ primary: 'inbox*', secondary: 'tasks* web:v1' });
    });
});

describe('the new tab page', () => {
    test('⌘T and the plus open it as a selected tab at the end of the row', () => {
        const calls: unknown[] = [];
        openNewTabPage({ openInFocusedPane: (...args) => calls.push(args) });
        expect(calls).toEqual([[newTabLocation, 'newTabAtEnd']]);
        const state = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            {
                intent: 'newTabAtEnd',
                kind: 'openInFocusedPane',
                location: newTabLocation,
            }
        );
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks newTab*',
        });
    });

    test('newTabAtEnd appends after the last tab; newTab still lands after the current one', () => {
        const base = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('b'), newId: 'b' },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('c'), newId: 'c' },
            { kind: 'select', tabId: 'b' }
        );
        expect(describeTabs(base).primary).toBe('inbox b* c');
        const atEnd = run(base, {
            intent: 'newTabAtEnd',
            kind: 'openInFocusedPane',
            location: newTabLocation,
        });
        expect(describeTabs(atEnd).primary).toBe('inbox b c newTab*');
        const after = run(base, {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: newTabLocation,
        });
        expect(describeTabs(after).primary).toBe('inbox b newTab* c');
    });

    test('newTabAtEnd works in the secondary pane', () => {
        const state = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            { intent: 'newTab', kind: 'openInFocusedPane', location: app('b'), newId: 'sb' },
            { kind: 'select', tabId: 't1' },
            { intent: 'newTabAtEnd', kind: 'openInFocusedPane', location: newTabLocation }
        );
        expect(describeTabs(state).secondary).toBe('tasks b newTab*');
    });

    test('choosing a site navigates the same tab; Back returns to the start page', () => {
        const opened = run(start(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: newTabLocation,
            newId: 'nt',
        });
        const visited = run(opened, {
            kind: 'navigate',
            location: web('v1'),
            mode: 'push',
            tabId: 'nt',
        });
        expect(describeTabs(visited).primary).toBe('inbox web:v1*');
        const back = run(visited, { delta: -1, kind: 'go', tabId: 'nt' });
        expect(describeTabs(back).primary).toBe('inbox newTab*');
    });

    test('the sidebar navigates a new tab page in place', () => {
        const state = run(
            start(),
            { intent: 'newTab', kind: 'openInFocusedPane', location: newTabLocation },
            { intent: 'current', kind: 'openInFocusedPane', location: app('chats/a') }
        );
        expect(describeTabs(state).primary).toBe('inbox chats/a*');
    });
});
