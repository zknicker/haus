import type { Chat } from '@haus/api';

/**
 * One Chat, for tests that need a whole `Chat` to exercise something else.
 * Four suites carried their own full copies, so every field the contract
 * gained had to be pasted into each of them; they now name only what they
 * assert on. The same reason `testAgent` exists.
 */
export function testChat(overrides: Partial<Chat> = {}): Chat {
    return {
        archivedAt: null,
        archivedByUserId: null,
        color: null,
        createdAt: '2026-07-29T12:00:00.000Z',
        description: null,
        icon: null,
        id: 'chat_one',
        isAll: false,
        kind: 'channel',
        lastActivityAt: null,
        lastMessage: null,
        lastMessageSequence: 0,
        name: 'planning',
        participantAgentIds: [],
        participantUserIds: [],
        peerAgentDisplayName: null,
        peerAgentId: null,
        peerAgentRetired: false,
        peerUserId: null,
        serverId: 'server_one',
        unreadCount: 0,
        ...overrides,
    };
}
