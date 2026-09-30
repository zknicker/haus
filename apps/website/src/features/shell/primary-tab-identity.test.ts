import { describe, expect, test } from 'bun:test';
import { resolvePrimaryTabIdentity } from './primary-tab-identity.ts';

const channel = {
    color: 'blue',
    icon: 'Rocket01Icon',
    kind: 'channel' as const,
    name: 'product',
    peerAgentDisplayName: null,
};
const dm = {
    color: null,
    icon: null,
    kind: 'dm' as const,
    name: null,
    peerAgentDisplayName: 'Blippy',
};
const blippy = { avatarUrl: 'https://example.com/blippy.png', displayName: 'Blippy' };

describe('primary tab identity', () => {
    test('a channel keeps its own icon and color', () => {
        expect(resolvePrimaryTabIdentity({ agent: null, chat: channel, section: 'chat' })).toEqual({
            kind: 'channel',
            color: 'blue',
            icon: 'Rocket01Icon',
            label: 'product',
        });
    });

    test('a DM shows its Agent, with or without a chat record yet', () => {
        expect(resolvePrimaryTabIdentity({ agent: blippy, chat: dm, section: 'chat' })).toEqual({
            kind: 'dm',
            avatarUrl: 'https://example.com/blippy.png',
            label: 'Blippy',
        });
        expect(resolvePrimaryTabIdentity({ agent: blippy, chat: null, section: 'chat' })).toEqual({
            kind: 'dm',
            avatarUrl: 'https://example.com/blippy.png',
            label: 'Blippy',
        });
        expect(resolvePrimaryTabIdentity({ agent: null, chat: dm, section: 'chat' })).toEqual({
            kind: 'dm',
            avatarUrl: null,
            label: 'Blippy',
        });
    });

    test('every other route names its section', () => {
        expect(resolvePrimaryTabIdentity({ agent: null, chat: null, section: 'inbox' })).toEqual({
            kind: 'section',
            label: 'Inbox',
            section: 'inbox',
        });
        expect(resolvePrimaryTabIdentity({ agent: blippy, chat: null, section: 'agent' })).toEqual({
            kind: 'section',
            label: 'Agent',
            section: 'agent',
        });
    });
});
