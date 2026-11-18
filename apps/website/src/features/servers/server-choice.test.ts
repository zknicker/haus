import { describe, expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import {
    lastServerSlugStorageKey,
    parseInvitationToken,
    readLastChatId,
    readLastServerSlug,
    rememberLastChatId,
    rememberLastServerSlug,
    resolveEntryChat,
    resolveEntryServer,
} from './server-choice.ts';

const servers = [
    { displayName: 'Arcade', id: 'server-1', role: 'owner', slug: 'arcade' },
    { displayName: 'Studio', id: 'server-2', role: 'member', slug: 'studio' },
] satisfies ServerSummary[];
const chats = [
    { id: 'chat-product', isAll: false },
    { id: 'chat-all', isAll: true },
] as Chat[];

describe('Server entry choice', () => {
    test('uses the last joined Server and falls back to the first joined Server', () => {
        expect(resolveEntryServer(servers, 'studio')?.slug).toBe('studio');
        expect(resolveEntryServer(servers, 'departed')?.slug).toBe('arcade');
        expect(resolveEntryServer([], 'studio')).toBeNull();
    });

    test('persists only the current Server slug', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        };

        rememberLastServerSlug('studio', storage);

        expect(values.get(lastServerSlugStorageKey)).toBe('studio');
        expect(readLastServerSlug(storage)).toBe('studio');
    });
});

describe('Chat entry choice', () => {
    test('uses the last valid Chat, then all, then the first available Chat', () => {
        expect(resolveEntryChat(chats, 'chat-product')?.id).toBe('chat-product');
        expect(resolveEntryChat(chats, 'deleted-chat')?.id).toBe('chat-all');
        expect(resolveEntryChat([{ ...chats[0], isAll: false }], null)?.id).toBe('chat-product');
        expect(resolveEntryChat([], null)).toBeNull();
    });

    test('persists the last Chat independently for each Server', () => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        };

        rememberLastChatId('studio', 'chat-product', storage);
        rememberLastChatId('arcade', 'chat-all', storage);

        expect(readLastChatId('studio', storage)).toBe('chat-product');
        expect(readLastChatId('arcade', storage)).toBe('chat-all');
    });
});

describe('invitation entry', () => {
    test('accepts a token, invitation path, or invitation URL', () => {
        expect(parseInvitationToken('secret')).toBe('secret');
        expect(parseInvitationToken('/invite/path-token')).toBe('path-token');
        expect(parseInvitationToken('https://haus.test/invite/url-token')).toBe('url-token');
        expect(parseInvitationToken('  ')).toBeNull();
    });
});
