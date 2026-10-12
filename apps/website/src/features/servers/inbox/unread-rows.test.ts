import { expect, test } from 'bun:test';
import type { Chat, UnreadThread } from '@haus/api';
import { countUnreadRows, selectUnreadRows, unreadChatFacts } from './unread-rows.ts';

function chat(id: string, unreadCount: number, lastActivityAt: null | string): Chat {
    return { id, lastActivityAt, unreadCount } as Chat;
}

function thread(
    threadChatId: string,
    parentChatId: string,
    lastActivityAt: null | string
): UnreadThread {
    return { lastActivityAt, parentChatId, threadChatId, unreadCount: 1 } as UnreadThread;
}

const ids = (rows: ReturnType<typeof selectUnreadRows>) => rows.map((row) => row.id);

test('Unread is every Chat with anything unread, newest activity first', () => {
    const chats = [
        chat('cht_read', 0, '2026-10-01T12:00:00.000Z'),
        chat('cht_older', 2, '2026-10-01T09:00:00.000Z'),
        chat('cht_never', 1, null),
        // 11:00 at -04:00 is 15:00Z: newest, though it sorts last as text.
        chat('cht_offset', 1, '2026-10-01T11:00:00.000-04:00'),
        chat('cht_newer', 5, '2026-10-01T14:00:00.000Z'),
    ];
    expect(ids(selectUnreadRows(chats, []))).toEqual([
        'cht_offset',
        'cht_newer',
        'cht_older',
        'cht_never',
    ]);
});

test('unread Threads are their own rows, merged by activity, under a read parent too', () => {
    const chats = [
        chat('cht_read', 0, '2026-10-01T12:00:00.000Z'),
        chat('cht_lit', 1, '2026-10-01T10:00:00.000Z'),
    ];
    const rows = selectUnreadRows(chats, [
        thread('thr_new', 'cht_read', '2026-10-01T13:00:00.000Z'),
        thread('thr_old', 'cht_lit', '2026-10-01T08:00:00.000Z'),
    ]);

    expect(ids(rows)).toEqual(['thr_new', 'cht_lit', 'thr_old']);
    expect(rows[0]).toMatchObject({ kind: 'thread', parent: { id: 'cht_read' } });
});

test('a Thread whose parent the list does not hold yet waits for it', () => {
    expect(selectUnreadRows([], [thread('thr_orphan', 'cht_missing', null)])).toEqual([]);
});

test('the badge counts exactly the rows the section lists', () => {
    const chats = [chat('cht_read', 0, null), chat('cht_lit', 3, null)];
    const threads = [
        thread('thr_a', 'cht_read', null),
        thread('thr_b', 'cht_lit', null),
        thread('thr_orphan', 'cht_missing', null),
    ];

    const count = countUnreadRows(
        unreadChatFacts(chats),
        threads.map((entry) => entry.parentChatId)
    );

    expect(count).toBe(3);
    expect(count).toBe(selectUnreadRows(chats, threads).length);
});

test('the badge facts hold still while a count moves inside an unread Chat', () => {
    const before = unreadChatFacts([chat('cht_b', 1, null), chat('cht_a', 2, null)]);
    const after = unreadChatFacts([chat('cht_a', 3, null), chat('cht_b', 1, null)]);

    expect(after).toEqual(before);
});

test('nothing unread is an empty Unread', () => {
    expect(selectUnreadRows([chat('cht_read', 0, null)], [])).toEqual([]);
});
