import { describe, expect, test } from 'bun:test';
import { newTabLocation, pagePlacement } from './desktop-tabs-model.ts';
import { initialDesktopTabs } from './desktop-tabs-reducer.ts';
import { app, describeTabs, run, split, start } from './desktop-tabs-test-fixtures.ts';

const thread = app('threads/c1/m1');

describe('pagePlacement', () => {
    test('Agent profiles and Settings open new tabs, Threads the side pane, the rest places', () => {
        expect(pagePlacement(app('agents/a1/setup'))).toBe('newTab');
        expect(pagePlacement(app('settings/members'))).toBe('newTab');
        expect(pagePlacement(thread)).toBe('sidePane');
        expect(pagePlacement(app('agents'))).toBe('place');
        expect(pagePlacement(app('chats/a'))).toBe('place');
    });
});

// ADR 0039: Agent profiles and Settings always open a new tab.
describe('Agent and Settings open in a new tab', () => {
    test('a link from an app tab opens a selected tab after the source, leaving it untouched', () => {
        const state = run(start('chats/a'), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('agents/a1'),
        });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'chats/a agents/a1*',
            secondary: '-',
        });
        expect(state.tabs.t0?.history.entries).toHaveLength(1);
    });

    test('with two panes the new tab stays in the source pane', () => {
        const state = run(split(), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('agents/a1'),
        });
        expect(describeTabs(state)).toMatchObject({
            primary: 'inbox agents/a1*',
            secondary: 'tasks*',
        });
    });

    test('a second open of the same Agent selects the existing tab, drilling in', () => {
        let state = run(start(), {
            intent: 'current',
            kind: 'openInFocusedPane',
            location: app('agents/a1'),
        });
        state = run(state, { kind: 'select', tabId: 't0' });
        state = run(state, {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('agents/a1/setup'),
        });
        expect(describeTabs(state).primary).toBe('inbox agents/a1/setup*');
    });

    test('a Settings section from a Settings tab navigates in place; ⌘, opens one tab only', () => {
        let state = run(start(), { kind: 'reveal', location: app('settings/profile') });
        expect(describeTabs(state).primary).toBe('inbox settings/profile*');
        state = run(state, { kind: 'reveal', location: app('settings/members') });
        expect(describeTabs(state).primary).toBe('inbox settings/members*');
    });

    test('⌘, from a blank new tab page turns that tab into Settings', () => {
        const blank = initialDesktopTabs(newTabLocation, { entryKey: 'e0', tabId: 't0' });
        const state = run(blank, { kind: 'reveal', location: app('settings/profile') });
        expect(describeTabs(state).primary).toBe('settings/profile*');
    });

    test('a Settings tab linking to an Agent opens a new tab', () => {
        const state = run(start('settings/members'), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: app('agents/a1'),
        });
        expect(describeTabs(state).primary).toBe('settings/members agents/a1*');
    });
});

// ADR 0039: a Thread always opens in the right pane.
describe('Threads open in the side pane', () => {
    test('from a one-pane window the right pane opens with the Thread selected and focused', () => {
        const state = run(start('chats/c1'), {
            fromTabId: 't0',
            intent: 'auto',
            kind: 'openLink',
            location: thread,
        });
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'chats/c1*',
            secondary: 'threads/c1/m1*',
        });
    });

    test('from a secondary-pane tab it lands in the secondary pane after it', () => {
        const state = run(split(), {
            fromTabId: 't1',
            intent: 'auto',
            kind: 'openLink',
            location: thread,
        });
        expect(describeTabs(state)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'tasks threads/c1/m1*',
        });
    });

    test('an open Thread tab is selected anywhere, not duplicated', () => {
        let state = run(start('chats/c1'), { kind: 'reveal', location: thread });
        state = run(state, {
            kind: 'move',
            tabIds: [state.secondary?.selectedTabId ?? ''],
            to: { index: 0, pane: 'primary' },
        });
        state = run(state, { kind: 'select', tabId: 't0' });
        state = run(state, { fromTabId: 't0', intent: 'auto', kind: 'openLink', location: thread });
        expect(describeTabs(state)).toMatchObject({ primary: 'threads/c1/m1* chats/c1' });
    });

    test('a background gesture opens it unselected in the side pane without moving focus', () => {
        const state = run(split(), {
            fromTabId: 't0',
            intent: 'backgroundTab',
            kind: 'openLink',
            location: thread,
        });
        expect(describeTabs(state)).toEqual({
            focused: 'primary',
            primary: 'inbox*',
            secondary: 'tasks* threads/c1/m1',
        });
    });

    test('the sidebar and notifications follow the same rule', () => {
        const fromChrome = run(start(), {
            intent: 'newTab',
            kind: 'openInFocusedPane',
            location: thread,
        });
        expect(describeTabs(fromChrome)).toMatchObject({
            focused: 'secondary',
            secondary: 'threads/c1/m1*',
        });
        const revealed = run(start(), { kind: 'reveal', location: thread });
        expect(describeTabs(revealed)).toEqual({
            focused: 'secondary',
            primary: 'inbox*',
            secondary: 'threads/c1/m1*',
        });
    });
});
