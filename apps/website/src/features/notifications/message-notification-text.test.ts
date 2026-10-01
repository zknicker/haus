import { expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import { humanDirectory } from '../servers/human-identity.ts';
import { messageNotificationText } from './message-notification-text.ts';

const names = {
    agents: [],
    chats: [{ id: 'cht_product', name: 'product' } as Chat],
    humans: humanDirectory([]),
};
const message = {
    author: {
        agentId: 'agt_orbit',
        kind: 'agent' as const,
        profile: { avatarUrl: null, deleted: false, description: null, displayName: 'Orbit' },
    },
    content: 'Should I   run\nit?',
};

test('a DM names only its author and opens the DM', () => {
    expect(
        messageNotificationText({
            anchorMessageId: null,
            conversationChatId: 'cht_dm',
            message,
            names,
            reason: 'dm',
            slug: 'hq',
        })
    ).toEqual({ body: 'Should I run it?', path: '/s/hq/chats/cht_dm', title: 'Orbit' });
});

test('a Channel Thread message names the Channel and opens the Thread beside it', () => {
    expect(
        messageNotificationText({
            anchorMessageId: 'msg_anchor',
            conversationChatId: 'cht_product',
            message,
            names,
            reason: 'mention',
            slug: 'hq',
        })
    ).toMatchObject({
        path: '/s/hq/chats/cht_product?thread=msg_anchor',
        title: 'Orbit in #product › thread',
    });
});
