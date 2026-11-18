import { expect, test } from 'bun:test';
import type { Chat, ChatUnreadPreview } from '@haus/api';
import { countUnreadChats, followedTaskPreviews, selectUnreadRows } from './unread-rows.ts';

function chat(id: string, unreadCount: number, lastActivityAt: null | string): Chat {
    return { id, lastActivityAt, unreadCount } as Chat;
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
    expect(ids(selectUnreadRows(chats))).toEqual([
        'cht_offset',
        'cht_newer',
        'cht_older',
        'cht_never',
    ]);
});

test('the badge counts exactly the Chat rows the section lists', () => {
    const chats = [chat('cht_read', 0, null), chat('cht_lit', 3, null), chat('cht_dm', 1, null)];

    expect(countUnreadChats(chats)).toBe(2);
    expect(countUnreadChats(chats)).toBe(selectUnreadRows(chats).length);
});

test('nothing unread is an empty Unread', () => {
    expect(selectUnreadRows([chat('cht_read', 0, null)])).toEqual([]);
});

test('a followed Task with unread messages is a row like a Channel, by its newest message', () => {
    const previews = [
        { chatId: 'cht_lit', messages: [{ createdAt: '2026-10-01T09:00:00.000Z' }], task: null },
        {
            chatId: 'cht_task',
            messages: [{ createdAt: '2026-10-01T10:00:00.000Z' }],
            task: {
                key: 'SEC-1',
                originChatId: 'cht_lit',
                state: 'open',
                taskId: 'tsk_1',
                title: 'T',
            },
        },
    ] as ChatUnreadPreview[];
    const tasks = followedTaskPreviews(previews);
    const chats = [chat('cht_lit', 1, '2026-10-01T09:00:00.000Z')];

    expect(tasks.map((preview) => preview.chatId)).toEqual(['cht_task']);
    const rows = selectUnreadRows(chats, tasks);
    expect(ids(rows)).toEqual(['cht_task', 'cht_lit']);
    expect(rows[0]).toMatchObject({ kind: 'task-chat' });
    expect(countUnreadChats(chats) + tasks.length).toBe(rows.length);
});
