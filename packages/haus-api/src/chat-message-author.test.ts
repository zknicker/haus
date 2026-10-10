import { expect, test } from 'bun:test';
import { chatMessageSchema } from './chat.ts';

test('Server message history can preserve a deleted author profile', () => {
    const message = chatMessageSchema.parse({
        attachments: [],
        body: { kind: 'text' },
        author: {
            agentId: 'agt_cove',
            kind: 'agent',
            profile: {
                avatarUrl: '/api/avatars/avt_cove',
                deleted: true,
                description: 'Onboarding Assistant',
                displayName: 'Cove',
            },
        },
        chatId: 'cht_onboarding',
        content: 'Historical guidance.',
        createdAt: '2026-08-10T12:00:00.000Z',
        id: 'msg_cove',
        nonce: 'cove-history',
        runId: null,
        sequence: 1,
        serverId: 'srv_main',
    });

    expect(message.author).toMatchObject({
        kind: 'agent',
        profile: { deleted: true, displayName: 'Cove' },
    });
});

test('Server message contracts admit only human and Agent authors', () => {
    // Every durable Chat message has a human or an Agent author. Agent-only
    // deliveries ride the typed agent inbox, never a Chat row.
    expect(() =>
        chatMessageSchema.parse({
            attachments: [],
            author: { kind: 'system', system: 'session' },
            body: { kind: 'text' },
            chatId: 'cht_all',
            content: 'Session reset.',
            createdAt: '2026-07-26T12:00:00.000Z',
            id: 'msg_session_notice',
            nonce: 'session-notice',
            runId: null,
            sequence: 2,
            serverId: 'srv_main',
        })
    ).toThrow();
});

test('an Agent message carries the session that wrote it', () => {
    const message = chatMessageSchema.parse({
        attachments: [],
        author: { agentId: 'agt_cove', kind: 'agent' },
        body: { kind: 'text' },
        chatId: 'cht_all',
        content: 'Back with a fresh session.',
        createdAt: '2026-07-26T12:00:00.000Z',
        id: 'msg_after_reset',
        nonce: 'after-reset',
        runId: 'run_1',
        sequence: 4,
        serverId: 'srv_main',
        sessionGeneration: 3,
    });
    expect(message.sessionGeneration).toBe(3);
    // A human message says nothing about sessions.
    expect(
        chatMessageSchema.parse({
            attachments: [],
            author: { kind: 'human', userId: 'usr_1' },
            body: { kind: 'text' },
            chatId: 'cht_all',
            content: 'Thanks.',
            createdAt: '2026-07-26T12:00:01.000Z',
            id: 'msg_human',
            nonce: 'human-1',
            runId: null,
            sequence: 5,
            serverId: 'srv_main',
        }).sessionGeneration
    ).toBeNull();
});
