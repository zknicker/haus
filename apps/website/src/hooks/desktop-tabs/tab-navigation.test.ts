import { expect, test } from 'vitest';
import { tabPageKey } from './desktop-tabs-model.ts';
import {
    openWithGesture,
    readTabIntent,
    resolveTabNavigation,
    tabIntentState,
    tabIntentStateKey,
} from './tab-navigation.ts';

const app = (path: string) => ({ kind: 'app', path }) as const;

test('page keys ignore drill-down but separate pages', () => {
    expect(tabPageKey(app('/s/acme/chats/c1?thread=m1'))).toBe('chats/c1');
    expect(tabPageKey(app('/s/acme/agents/a1/setup'))).toBe('agents/a1');
    expect(tabPageKey(app('/s/acme/settings/members'))).toBe('settings');
    expect(tabPageKey(app('/s/acme/inbox'))).toBe('inbox');
});

test('a page push to another page is Open; drill-down and redirects stay in the tab', () => {
    const base = { gesture: 'auto', policy: 'page' } as const;
    const push = (from: string, to: string) =>
        resolveTabNavigation({ ...base, from: app(from), mode: 'push', to: app(to) });
    expect(push('/s/acme/chats/c1', '/s/acme/chats/c2')).toEqual({ kind: 'open' });
    expect(push('/s/acme/settings/profile', '/s/acme/settings/members')).toEqual({
        kind: 'navigate',
        mode: 'push',
    });
    expect(push('/s/acme/agents/a1', '/s/acme/agents/a1/setup')).toEqual({
        kind: 'navigate',
        mode: 'push',
    });
    expect(
        resolveTabNavigation({
            ...base,
            from: app('/s/acme/chats/gone'),
            mode: 'replace',
            to: app('/s/acme'),
        })
    ).toEqual({ kind: 'navigate', mode: 'replace' });
});

test('window chrome is always Go, even to the page the tab it reads already shows', () => {
    const from = app('/s/acme/inbox');
    const to = app('/s/acme/chats/c1');
    const shell = { gesture: 'auto', policy: 'shell' } as const;
    expect(resolveTabNavigation({ ...shell, from, mode: 'push', to })).toEqual({ kind: 'goTo' });
    expect(resolveTabNavigation({ ...shell, from, mode: 'replace', to })).toEqual({
        kind: 'navigate',
        mode: 'replace',
    });
    // The right pane is focused and shows #x: a sidebar click on #x still goes left.
    const x = app('/s/acme/chats/x');
    expect(resolveTabNavigation({ ...shell, from: x, mode: 'push', to: x })).toEqual({
        kind: 'goTo',
    });
    expect(
        resolveTabNavigation({
            ...shell,
            from: app('/s/acme/settings/profile'),
            mode: 'push',
            to: app('/s/acme/settings/members'),
        })
    ).toEqual({ kind: 'goTo' });
});

test('a modified push opens a tab beside the source from a page and from chrome alike', () => {
    const from = app('/s/acme/inbox');
    for (const policy of ['page', 'shell'] as const) {
        // Even to the page the tab already shows: modified clicks never dedupe.
        for (const to of [app('/s/acme/chats/c1'), app('/s/acme/inbox')]) {
            expect(
                resolveTabNavigation({ from, gesture: 'backgroundTab', mode: 'push', policy, to })
            ).toEqual({ background: true, kind: 'openTab' });
            expect(
                resolveTabNavigation({ from, gesture: 'newTab', mode: 'push', policy, to })
            ).toEqual({ background: false, kind: 'openTab' });
        }
    }
});

test('router state carries a gesture read before an await', () => {
    expect(tabIntentStateKey).toBe('hausTabIntent');
    for (const gesture of ['auto', 'backgroundTab', 'newTab'] as const) {
        expect(readTabIntent(tabIntentState(gesture))).toBe(gesture);
    }
    expect(readTabIntent(null)).toBeNull();
    expect(readTabIntent({ [tabIntentStateKey]: 'here' })).toBeNull();
});

test('openWithGesture: plain is Open, modifiers a tab beside the source', () => {
    const calls: unknown[][] = [];
    const tabs = {
        open: (...args: unknown[]) => calls.push(['open', ...args]),
        openTab: (...args: unknown[]) => calls.push(['openTab', ...args]),
    };
    const page = app('/s/acme/chats/c1');
    openWithGesture(tabs, 't1', page, 'auto');
    openWithGesture(tabs, 't1', page, 'backgroundTab');
    openWithGesture(tabs, null, page, 'newTab');
    expect(calls).toEqual([
        ['open', 't1', page],
        ['openTab', 't1', page, { background: true }],
        ['openTab', null, page, { background: false }],
    ]);
});
