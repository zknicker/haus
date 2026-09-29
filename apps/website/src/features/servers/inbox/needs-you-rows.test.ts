import { describe, expect, test } from 'bun:test';
import type { Agent, NeedsYouRow } from '@haus/api';
import { withoutDoneRow } from '../../../hooks/servers/use-needs-you-done.ts';
import { humanDirectory } from '../human-identity.ts';
import {
    needsYouChatIds,
    needsYouConversationPath,
    needsYouNotificationText,
    toNeedsYouRowView,
} from './needs-you-rows.ts';

const latest = {
    author: { agentId: 'agt_orbit', kind: 'agent' },
    createdAt: '2026-09-29T12:00:00.000Z',
    messageId: 'msg_2',
    preview: 'The migration is staged. Should I run it?',
    sequence: 7,
} as const;

const dmRow: NeedsYouRow = {
    addressedCount: 1,
    chatId: 'cht_dm',
    chatKind: 'dm',
    chatPeerAgentId: 'agt_orbit',
    chatPeerUserId: null,
    conversationChatId: 'cht_dm',
    latest,
    reason: 'dm',
    threadAnchorMessageId: null,
};

const threadRow: NeedsYouRow = {
    addressedCount: 2,
    chatId: 'cht_thread',
    chatKind: 'channel',
    chatName: 'product',
    conversationChatId: 'cht_product',
    latest: { ...latest, author: { kind: 'human', userId: 'usr_bo' }, sequence: 3 },
    reason: 'mention',
    threadAnchorMessageId: 'msg_anchor',
};

const names = {
    agents: [
        { avatarUrl: 'https://example.test/orbit.png', displayName: 'Orbit', id: 'agt_orbit' },
    ] as Agent[],
    humans: humanDirectory([
        { avatarUrl: null, displayName: 'Bo', handle: 'bo', userId: 'usr_bo' },
    ] as unknown as Parameters<typeof humanDirectory>[0]),
};

describe('toNeedsYouRowView', () => {
    test('a DM row names its Agent and has no place of its own', () => {
        expect(toNeedsYouRowView(dmRow, names)).toMatchObject({
            authorAgentId: 'agt_orbit',
            authorAvatarUrl: 'https://example.test/orbit.png',
            authorName: 'Orbit',
            id: 'cht_dm',
            place: null,
            preview: 'The migration is staged. Should I run it?',
        });
    });

    test('a Thread mention names the human and the Channel it lives in', () => {
        expect(toNeedsYouRowView(threadRow, names)).toMatchObject({
            authorAgentId: null,
            authorName: 'Bo',
            place: '#product › thread',
        });
    });

    test('an inline reply to the viewer reads in its Channel like a mention', () => {
        const replyRow: NeedsYouRow = {
            ...threadRow,
            chatId: 'cht_product',
            reason: 'reply',
            threadAnchorMessageId: null,
        };
        expect(toNeedsYouRowView(replyRow, names).place).toBe('#product');
    });

    test('a retired Agent still reads by its stored name, then its id', () => {
        const retired = { ...names, agents: [] };
        expect(toNeedsYouRowView(dmRow, retired).authorName).toBe('Agent _orbit');
        const stored: NeedsYouRow = {
            ...dmRow,
            latest: {
                ...latest,
                author: {
                    agentId: 'agt_orbit',
                    kind: 'agent',
                    profile: {
                        avatarUrl: null,
                        deleted: true,
                        description: null,
                        displayName: 'Old Orbit',
                    },
                },
            },
        };
        expect(toNeedsYouRowView(stored, retired).authorName).toBe('Old Orbit');
    });
});

test('a row opens its conversation, with the Thread open for a Thread row', () => {
    expect(needsYouConversationPath('acme', dmRow)).toBe('/s/acme/chats/cht_dm');
    expect(needsYouConversationPath('acme', threadRow)).toBe(
        '/s/acme/chats/cht_product?thread=msg_anchor'
    );
});

test('Conversations hides exactly the Chats that have a row', () => {
    expect([...needsYouChatIds([dmRow, threadRow])]).toEqual(['cht_dm', 'cht_thread']);
});

test('a notification names the author and the place', () => {
    expect(needsYouNotificationText(toNeedsYouRowView(threadRow, names))).toEqual({
        body: 'The migration is staged. Should I run it?',
        title: 'Bo in #product › thread',
    });
    expect(needsYouNotificationText(toNeedsYouRowView(dmRow, names)).title).toBe('Orbit');
});

describe('withoutDoneRow', () => {
    test('Done removes the row it covered', () => {
        expect(
            withoutDoneRow([dmRow, threadRow], { chatId: 'cht_dm', throughSequence: 7 })
        ).toEqual([threadRow]);
    });

    test('newer addressing than the Done covered keeps the row', () => {
        expect(withoutDoneRow([dmRow], { chatId: 'cht_dm', throughSequence: 6 })).toEqual([dmRow]);
    });
});
