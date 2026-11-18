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
            chatId: 'cht_dm',
            message,
            names,
            reason: 'dm',
            slug: 'hq',
        })
    ).toEqual({ body: 'Should I run it?', path: '/s/hq/chats/cht_dm', title: 'Orbit' });
});

test('a Channel message names the Channel and opens it', () => {
    expect(
        messageNotificationText({
            chatId: 'cht_product',
            message,
            names,
            reason: 'mention',
            slug: 'hq',
        })
    ).toMatchObject({ path: '/s/hq/chats/cht_product', title: 'Orbit in #product' });
});
