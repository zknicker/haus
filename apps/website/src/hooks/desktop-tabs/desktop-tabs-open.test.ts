import { describe, expect, test } from 'bun:test';
import { newTabLocation, type TabLocation } from './desktop-tabs-model.ts';
import { app, describeTabs, run, split, start, web } from './desktop-tabs-test-fixtures.ts';
import { openNewTabPage } from './use-desktop-tab-shortcuts.ts';

const open = (location: TabLocation, fromTabId: string | null = 't0', newId?: string) =>
    ({ fromTabId, kind: 'open', location, ...(newId ? { newId } : {}) }) as const;

describe('Open: anything activated inside a page (ADR 0039)', () => {
    test('from the left pane of a one-pane window: creates the right pane, selected and focused', () => {
        const state = run(start('chats/a'), open(app('chats/b')));
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'chats/a*',
            secondary: 'chats/b*',
        });
    });

    test('consecutive opens from the left run in order after the right pane’s selected tab', () => {
        const state = run(split(), open(app('a')), open(app('b')), open(app('c')));
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks a b c*',
        });
    });

    test('from inside the right pane: stacks in the right pane after the source', () => {
        const state = run(split(), open(app('a'), 't1', 'a'), open(app('b'), 'a'));
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox*',
            secondary: 'tasks a b*',
        });
    });

    test('dedupes within the right pane only: an open right tab is selected, a deeper address pushed', () => {
        const base = run(split(), open(app('chats/c1')), {
            kind: 'select',
            tabId: 't1',
        });
        const state = run(base, open(app('chats/c1?thread=m1')));
        expect(describeTabs(state)).toMatchObject({
            focused: 'secondary',
            secondary: 'tasks chats/c1?thread=m1*',
        });
    });

    test('never dedupes window-wide: a page the left pane shows opens again on the right', () => {
        const state = run(start('chats/a'), open(app('chats/a')));
        expect(describeTabs(state)).toMatchObject({ primary: 'chats/a*', secondary: 'chats/a*' });
    });

    test('a Thread, an Agent profile, and Settings all open on the right like any page', () => {
        const state = run(
            start(),
            open(app('threads/c1/m1')),
            open(app('agents/a1')),
            open(app('settings/members'))
        );
        expect(describeTabs(state).secondary).toBe('threads/c1/m1 agents/a1 settings/members*');
    });

    test('no source (notification, deep link, ⌘F): the right pane like any open', () => {
        const state = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            open(app('search'), null)
        );
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox*',
            secondary: 'tasks search*',
        });
    });

    test('web links: a new web tab on the right; a web page in the right pane stacks there', () => {
        const fromApp = run(start(), open(web('v1')), open(web('v2')));
        expect(describeTabs(fromApp)).toMatchObject({
            primary: 'inbox*',
            secondary: 'web:v1 web:v2*',
        });
        const fromWeb = run(
            split(),
            { kind: 'navigate', location: web('p'), mode: 'push', newId: 'e1', tabId: 't1' },
            open(web('v1'), 't1')
        );
        expect(describeTabs(fromWeb).secondary).toBe('web:p web:v1*');
    });

    test('an empty window opens the page as its first tab', () => {
        const empty = run(start(), { kind: 'close', tabIds: ['t0'] });
        expect(describeTabs(run(empty, open(app('inbox'), null))).primary).toBe('inbox*');
    });
});

describe('the new tab page', () => {
    test('⌘T and the plus open it as a selected tab at the end of the focused row', () => {
        const calls: unknown[] = [];
        openNewTabPage({ openNewTab: (...args) => calls.push(args) });
        expect(calls).toEqual([[newTabLocation]]);
        const state = run(
            split(),
            { kind: 'focusPane', pane: 'secondary' },
            { kind: 'openNewTab', location: newTabLocation }
        );
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks newTab*',
        });
    });

    test('choosing a site navigates the same tab; Back returns to the start page', () => {
        const opened = run(start(), { kind: 'openNewTab', location: newTabLocation, newId: 'nt' });
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
});
