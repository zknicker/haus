import { describe, expect, test } from 'bun:test';
import { pushNotificationPayloadSchema } from './push.ts';

const payload = {
    aps: {
        alert: { body: 'Should I run it?', title: 'Orbit' },
        'mutable-content': 1,
        sound: 'default',
        'thread-id': 'cht_dm',
    },
    chatId: 'cht_dm',
    conversation: { kind: 'dm', name: null },
    conversationChatId: 'cht_dm',
    messageId: 'msg_1',
    sender: {
        avatarUrl: 'https://app.haus.chat/api/avatars/avt_orbit',
        id: 'agt_orbit',
        kind: 'agent',
        name: 'Orbit',
    },
    serverId: 'srv_main',
    threadAnchorMessageId: null,
};

describe('iPhone push payload contract', () => {
    test('accepts a Communication Notification payload', () => {
        expect(pushNotificationPayloadSchema.parse(payload)).toEqual(payload as never);
    });

    test('requires mutable content so the Notification Service extension runs', () => {
        const { 'mutable-content': _, ...aps } = payload.aps;
        expect(pushNotificationPayloadSchema.safeParse({ ...payload, aps }).success).toBe(false);
    });

    test('requires an absolute http(s) avatar URL or null', () => {
        const withAvatar = (avatarUrl: string | null) =>
            pushNotificationPayloadSchema.safeParse({
                ...payload,
                sender: { ...payload.sender, avatarUrl },
            }).success;
        expect(withAvatar(null)).toBe(true);
        expect(withAvatar('/api/avatars/avt_orbit')).toBe(false);
        expect(withAvatar('file:///tmp/avatar.png')).toBe(false);
    });

    test('names a Channel and never a DM', () => {
        const withConversation = (conversation: unknown) =>
            pushNotificationPayloadSchema.safeParse({ ...payload, conversation }).success;
        expect(withConversation({ kind: 'channel', name: 'product' })).toBe(true);
        expect(withConversation({ kind: 'channel', name: null })).toBe(false);
        expect(withConversation({ kind: 'dm', name: 'Orbit' })).toBe(false);
    });
});
