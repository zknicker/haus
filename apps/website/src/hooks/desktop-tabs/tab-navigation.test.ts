import { expect, test } from 'vitest';
import { tabPageKey } from './desktop-tabs-model.ts';
import { readTabIntent, resolveTabNavigation, tabIntentStateKey } from './tab-navigation.ts';

const app = (path: string) => ({ kind: 'app', path }) as const;

test('page keys ignore drill-down but separate pages', () => {
    expect(tabPageKey(app('/s/acme/chats/c1?thread=m1'))).toBe('chats/c1');
    expect(tabPageKey(app('/s/acme/agents/a1/setup'))).toBe('agents/a1');
    expect(tabPageKey(app('/s/acme/settings/members'))).toBe('settings');
    expect(tabPageKey(app('/s/acme/inbox'))).toBe('inbox');
});

test('a page push to another page is a link; drill-down and redirects stay in the tab', () => {
    const base = { intent: 'auto', policy: 'page' } as const;
    expect(
        resolveTabNavigation({
            ...base,
            from: app('/s/acme/chats/c1'),
            mode: 'push',
            to: app('/s/acme/chats/c2'),
        })
    ).toEqual({ kind: 'openLink', intent: 'auto' });
    expect(
        resolveTabNavigation({
            ...base,
            from: app('/s/acme/settings/profile'),
            mode: 'push',
            to: app('/s/acme/settings/members'),
        })
    ).toEqual({ kind: 'navigate', mode: 'push' });
    expect(
        resolveTabNavigation({
            ...base,
            from: app('/s/acme/chats/gone'),
            mode: 'replace',
            to: app('/s/acme'),
        })
    ).toEqual({ kind: 'navigate', mode: 'replace' });
});

test('the shell goes to a place; a redirect stays in the tab; Command-click opens a new tab', () => {
    const from = app('/s/acme/inbox');
    const to = app('/s/acme/chats/c1');
    expect(
        resolveTabNavigation({ from, intent: 'auto', mode: 'push', policy: 'shell', to })
    ).toEqual({ kind: 'openInFocusedPane', intent: 'current' });
    expect(
        resolveTabNavigation({ from, intent: 'auto', mode: 'replace', policy: 'shell', to })
    ).toEqual({ kind: 'navigate', mode: 'replace' });
    expect(
        resolveTabNavigation({ from, intent: 'newTab', mode: 'push', policy: 'shell', to })
    ).toEqual({ kind: 'openInFocusedPane', intent: 'newTab' });
    expect(tabIntentStateKey).toBe('hausTabIntent');
});

test('a page link and window chrome both keep the gesture', () => {
    const from = app('/s/acme/inbox');
    const to = app('/s/acme/chats/c1');
    for (const intent of ['backgroundTab', 'newTab'] as const) {
        expect(resolveTabNavigation({ from, intent, mode: 'push', policy: 'page', to })).toEqual({
            kind: 'openLink',
            intent,
        });
        expect(resolveTabNavigation({ from, intent, mode: 'push', policy: 'shell', to })).toEqual({
            kind: 'openInFocusedPane',
            intent,
        });
        expect(readTabIntent({ [tabIntentStateKey]: intent })).toBe(intent);
    }
});
