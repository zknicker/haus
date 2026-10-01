import { expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import { selectUnreadChats } from './unread-chats.ts';

function chat(id: string, unreadCount: number, lastActivityAt: null | string): Chat {
    return { id, lastActivityAt, unreadCount } as Chat;
}

test('Unread is every Chat with anything unread, newest activity first', () => {
    const chats = [
        chat('cht_read', 0, '2026-10-01T12:00:00.000Z'),
        chat('cht_older', 2, '2026-10-01T09:00:00.000Z'),
        chat('cht_never', 1, null),
        // 11:00 at -04:00 is 15:00Z: newest, though it sorts last as text.
        chat('cht_offset', 1, '2026-10-01T11:00:00.000-04:00'),
        chat('cht_newer', 5, '2026-10-01T14:00:00.000Z'),
    ];
    expect(selectUnreadChats(chats).map((item) => item.id)).toEqual([
        'cht_offset',
        'cht_newer',
        'cht_older',
        'cht_never',
    ]);
});

test('nothing unread is an empty Unread', () => {
    expect(selectUnreadChats([chat('cht_read', 0, null)])).toEqual([]);
});
