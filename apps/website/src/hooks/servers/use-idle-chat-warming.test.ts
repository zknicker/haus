import { expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import { chatsToWarm, createChatWarmer } from './use-idle-chat-warming.ts';

test('warms unread Chats first, then the most recently active, without repeats', () => {
    const chats = [
        chat('quiet', '2026-10-01T00:00:00Z', 0),
        chat('unread_old', '2026-09-01T00:00:00Z', 3),
        chat('recent', '2026-10-07T00:00:00Z', 0),
        chat('unread_recent', '2026-10-06T00:00:00Z', 1),
        chat('never', null, 0),
    ];

    expect(chatsToWarm(chats, 2)).toEqual(['unread_recent', 'unread_old', 'recent']);
    expect(chatsToWarm(chats, 10)).toEqual([
        'unread_recent',
        'unread_old',
        'recent',
        'quiet',
        'never',
    ]);
});

test('runs at most two warms at once, each Chat once, and stops when disposed', async () => {
    const scheduled: Array<() => void> = [];
    const pending = new Map<string, () => void>();
    const warmed: string[] = [];
    const warmer = createChatWarmer({
        concurrency: 2,
        schedule: (run) => {
            scheduled.push(run);
            return () => undefined;
        },
        warm: (chatId) => {
            warmed.push(chatId);
            return new Promise<void>((resolve) => pending.set(chatId, resolve));
        },
    });

    warmer.enqueue(['a', 'b', 'c', 'a']);
    warmer.enqueue(['b', 'd']);
    expect(scheduled).toHaveLength(2);
    for (const run of scheduled.splice(0)) {
        run();
    }
    expect(warmed).toEqual(['a', 'b']);

    pending.get('a')?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled).toHaveLength(1);
    scheduled.shift()?.();
    expect(warmed).toEqual(['a', 'b', 'c']);

    warmer.dispose();
    pending.get('b')?.();
    pending.get('c')?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled).toHaveLength(0);
    expect(warmed).toEqual(['a', 'b', 'c']);
});

function chat(id: string, lastActivityAt: string | null, unreadCount: number): Chat {
    return {
        archivedAt: null,
        archivedByUserId: null,
        color: null,
        createdAt: '2026-01-01T00:00:00Z',
        description: null,
        icon: null,
        id,
        isAll: false,
        kind: 'channel',
        lastActivityAt,
        lastMessage: null,
        lastMessageSequence: 0,
        name: id,
        participantAgentIds: [],
        participantUserIds: [],
        peerAgentDisplayName: null,
        peerAgentId: null,
        peerAgentRetired: false,
        peerUserId: null,
        serverId: 'srv_one',
        unreadCount,
    };
}
