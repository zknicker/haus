import { expect, test } from 'vitest';
import { parseTabPage, resolveTabIdentity, type TabIdentityRecords } from './tab-identity.ts';

const app = (path: string) => ({ kind: 'app', path }) as const;

const records: TabIdentityRecords = {
    agents: [{ avatarUrl: 'https://a/blippy.png', displayName: 'Blippy', id: 'ag1' }],
    browserTab: null,
    chats: [
        {
            color: 'blue',
            icon: 'Rocket01Icon',
            id: 'c1',
            kind: 'channel',
            name: 'product',
            peerAgentDisplayName: null,
            peerAgentId: null,
        },
        {
            color: null,
            icon: null,
            id: 'd1',
            kind: 'dm',
            name: null,
            peerAgentDisplayName: 'Blippy',
            peerAgentId: 'ag1',
        },
    ],
    threadExcerpt: null,
};

test('app paths parse to the page they show', () => {
    expect(parseTabPage(app('/s/acme/chats/c1?thread=m1'))).toEqual({ chatId: 'c1', kind: 'chat' });
    expect(parseTabPage(app('/s/acme/dm/ag1'))).toEqual({ agentId: 'ag1', kind: 'dm' });
    expect(parseTabPage(app('/s/acme/agents/ag1/setup'))).toEqual({
        agentId: 'ag1',
        kind: 'agent',
    });
    expect(parseTabPage(app('/s/acme/threads/c1/m1'))).toEqual({
        anchorMessageId: 'm1',
        chatId: 'c1',
        kind: 'thread',
    });
    expect(parseTabPage(app('/s/acme/files/c1'))).toEqual({ chatId: 'c1', kind: 'files' });
    expect(parseTabPage(app('/s/acme/artifacts/k1?title=Plan'))).toEqual({
        kind: 'artifact',
        title: 'Plan',
    });
    expect(parseTabPage(app('/s/acme/settings/members'))).toEqual({
        kind: 'section',
        section: 'settings',
    });
    expect(parseTabPage(app('/s/acme/inbox'))).toEqual({ kind: 'section', section: 'inbox' });
    expect(parseTabPage(app('/s/acme/chats/%E0'))).toEqual({ chatId: '%E0', kind: 'chat' });
});

test('a channel shows its icon box; a DM and an Agent page show the avatar', () => {
    expect(resolveTabIdentity(parseTabPage(app('/s/acme/chats/c1')), records)).toEqual({
        label: 'product',
        mark: { color: 'blue', icon: 'Rocket01Icon', kind: 'channel' },
        place: null,
    });
    const dm = resolveTabIdentity(parseTabPage(app('/s/acme/chats/d1')), records);
    expect(dm.label).toBe('Blippy');
    expect(dm.mark).toEqual({ kind: 'avatar', name: 'Blippy', src: 'https://a/blippy.png' });
    expect(resolveTabIdentity(parseTabPage(app('/s/acme/agents/ag1')), records).label).toBe(
        'Blippy'
    );
});

test('a page whose record has not loaded keeps an empty slot', () => {
    expect(
        resolveTabIdentity(parseTabPage(app('/s/acme/chats/c1')), { ...records, chats: null })
    ).toEqual({ label: '', mark: { kind: 'none' }, place: null });
});

test('Thread and Files pages wear their chat mark and name it as context', () => {
    const thread = resolveTabIdentity(parseTabPage(app('/s/acme/threads/c1/m1')), {
        ...records,
        threadExcerpt: 'Ship it',
    });
    expect(thread).toEqual({
        label: 'Ship it',
        mark: { color: 'blue', icon: 'Rocket01Icon', kind: 'channel' },
        place: '#product › thread',
    });
    expect(resolveTabIdentity(parseTabPage(app('/s/acme/files/d1')), records).place).toBe(
        'DM › files'
    );
});

test('sections wear their glyph; web pages prefer the live title and favicon', () => {
    expect(resolveTabIdentity(parseTabPage(app('/s/acme/tasks')), records)).toEqual({
        label: 'Tasks',
        mark: { glyph: 'tasks', kind: 'glyph' },
        place: null,
    });
    const web = { kind: 'browser', title: 'Old', url: 'https://x.dev', viewId: 'v1' } as const;
    expect(resolveTabIdentity(parseTabPage(web), records)).toEqual({
        label: 'Old',
        mark: { kind: 'favicon', loading: false, url: null },
        place: 'https://x.dev',
    });
    expect(
        resolveTabIdentity(parseTabPage(web), {
            ...records,
            browserTab: {
                faviconUrl: 'https://x.dev/f.ico',
                loading: true,
                title: 'New',
                url: 'https://x.dev/a',
            },
        })
    ).toEqual({
        label: 'New',
        mark: { kind: 'favicon', loading: true, url: 'https://x.dev/f.ico' },
        place: 'https://x.dev/a',
    });
});

test('the new tab page reads as New tab with a globe', () => {
    const page = parseTabPage({ kind: 'newTab' });
    expect(page).toEqual({ kind: 'newTab' });
    expect(resolveTabIdentity(page, records)).toEqual({
        label: 'New tab',
        mark: { glyph: 'newTab', kind: 'glyph' },
        place: null,
    });
});
