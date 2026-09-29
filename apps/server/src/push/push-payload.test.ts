import { describe, expect, test } from 'bun:test';
import {
    pushAlertBodyMaxLength,
    pushNotificationPayloadSchema,
    pushNotificationSenderNameMaxLength,
} from '@haus/api';
import type { NeedsYouChatRow } from '../needs-you/needs-you-query.ts';
import { buildPushPayload } from './push-payload.ts';

const appOrigin = 'https://app.haus.test';
const input = { appOrigin, badge: 3, serverId: 'srv_main' };

describe('buildPushPayload', () => {
    test('an Agent DM carries the Agent as sender with an absolute avatar URL', () => {
        const payload = buildPushPayload(
            row({
                authorAgentAvatarId: 'avt_orbit',
                authorAgentDisplayName: 'Orbit',
                authorAgentId: 'agt_orbit',
            }),
            input
        );
        expect(payload).toEqual({
            aps: {
                alert: { body: 'Should I run it?', title: 'Orbit' },
                badge: 3,
                'mutable-content': 1,
                sound: 'default',
                'thread-id': 'cht_dm',
            },
            chatId: 'cht_dm',
            conversation: { kind: 'dm', name: null },
            conversationChatId: 'cht_dm',
            messageId: 'msg_1',
            sender: {
                avatarUrl: 'https://app.haus.test/api/avatars/avt_orbit',
                id: 'agt_orbit',
                kind: 'agent',
                name: 'Orbit',
            },
            serverId: 'srv_main',
            threadAnchorMessageId: null,
        });
        expect(pushNotificationPayloadSchema.parse(payload)).toEqual(payload as never);
    });

    test('a Channel mention names the Channel without its sigil', () => {
        const payload = buildPushPayload(
            row({
                authorUserAvatarId: 'avt_bo',
                authorUserDisplayName: 'Bo',
                authorUserId: 'usr_bo',
                conversationKind: 'channel',
                conversationName: 'product',
            }),
            input
        );
        expect(payload?.aps.alert.title).toBe('Bo in #product');
        expect(payload?.conversation).toEqual({ kind: 'channel', name: 'product' });
        expect(payload?.sender).toEqual({
            avatarUrl: 'https://app.haus.test/api/avatars/avt_bo',
            id: 'usr_bo',
            kind: 'human',
            name: 'Bo',
        });
    });

    test('a human without an avatar sends a null avatar URL', () => {
        const payload = buildPushPayload(
            row({ authorUserDisplayName: 'Ada', authorUserId: 'usr_ada' }),
            input
        );
        expect(payload?.sender).toEqual({
            avatarUrl: null,
            id: 'usr_ada',
            kind: 'human',
            name: 'Ada',
        });
    });

    test('an unresolvable author or unnamed Channel builds no payload', () => {
        expect(buildPushPayload(row({}), input)).toBeNull();
        expect(
            buildPushPayload(
                row({
                    authorUserId: 'usr_ada',
                    conversationKind: 'channel',
                    conversationName: null,
                }),
                input
            )
        ).toBeNull();
    });

    test('the longest names and preview stay well inside the 4 KB APNs limit', () => {
        // Four-byte characters are the worst case for UTF-8 size per UTF-16 unit pair.
        const wide = '𝕏'.repeat(1000);
        const payload = buildPushPayload(
            row({
                anchorMessageId: `msg_${'a'.repeat(60)}`,
                authorAgentAvatarId: 'f'.repeat(64),
                authorAgentDisplayName: wide,
                authorAgentId: `agt_${'a'.repeat(60)}`,
                chatId: `cht_${'b'.repeat(60)}`,
                content: `${'界'.repeat(1000)}`,
                conversationChatId: `cht_${'c'.repeat(60)}`,
                conversationKind: 'channel',
                conversationName: 'x'.repeat(32),
                messageId: `msg_${'d'.repeat(60)}`,
            }),
            {
                appOrigin: `https://${'h'.repeat(60)}.example.com`,
                badge: 99_999,
                serverId: `srv_${'e'.repeat(60)}`,
            }
        );
        expect(payload).not.toBeNull();
        expect(payload?.sender.name.length).toBeLessThanOrEqual(
            pushNotificationSenderNameMaxLength
        );
        expect(payload?.aps.alert.body.length).toBeLessThanOrEqual(pushAlertBodyMaxLength);
        expect(pushNotificationPayloadSchema.parse(payload)).toEqual(payload as never);
        expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(4096);
    });
});

function row(overrides: Partial<NeedsYouChatRow>): NeedsYouChatRow {
    return {
        addressedCount: 1,
        anchorMessageId: null,
        authorAgentAvatarId: null,
        authorAgentDescription: null,
        authorAgentDisplayName: null,
        authorAgentId: null,
        authorAgentRetiredAt: null,
        authorUserAvatarId: null,
        authorUserDescription: null,
        authorUserDisplayName: null,
        authorUserId: null,
        authorUserRevokedAt: null,
        chatId: 'cht_dm',
        content: 'Should I run it?',
        conversationChatId: 'cht_dm',
        conversationKind: 'dm',
        conversationName: null,
        createdAt: new Date('2026-09-29T12:00:00.000Z'),
        dmAgentId: null,
        messageId: 'msg_1',
        peerUserId: null,
        reason: 'dm',
        sequence: 1,
        ...overrides,
    };
}
