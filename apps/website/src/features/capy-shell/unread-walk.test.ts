import { expect, test } from 'bun:test';
import type { Chat, ChatMessage, ChatUnreadPreview } from '@haus/api';
import { buildCapySidebar } from './sidebar-layout.ts';
import { nextUnreadHref, walkRows } from './unread-walk.ts';

const chat = (fields: Partial<Chat> & Pick<Chat, 'id' | 'kind'>) =>
    ({
        name: fields.id,
        participantAgentIds: [],
        peerAgentId: null,
        peerUserId: null,
        unreadCount: 0,
        ...fields,
    }) as Chat;

const chats = [
    chat({ id: 'dm-forge', kind: 'dm', peerAgentId: 'forge', unreadCount: 2 }),
    chat({ id: 'eng', kind: 'channel' }),
    chat({ id: 'sec', kind: 'channel', unreadCount: 4 }),
    chat({ id: 'dm-ada', kind: 'dm', peerUserId: 'ada', unreadCount: 1 }),
];
const previews = [
    {
        chatId: 'task-chat',
        earlierUnreadCount: 0,
        messages: [{ content: 'Done' } as ChatMessage],
        task: null,
    } as ChatUnreadPreview,
];
const rows = walkRows({
    channelOrder: [],
    chats,
    previews,
    sections: buildCapySidebar({
        agentIds: ['forge', 'orbit'],
        chats,
        openTasks: [
            {
                chatId: 'task-chat',
                createdAt: '2026-11-19T10:00:00Z',
                id: 't1',
                key: 'ENG-1',
                state: 'open',
            } as never,
        ],
        unreadPreviews: previews,
        viewerUserId: 'zach',
    }),
    slug: 'dev',
});

test('the walk reads the sidebar top to bottom: Captains, Projects, open Tasks, People', () => {
    expect(rows).toEqual([
        { href: '/s/dev/chats/dm-forge', unread: true },
        { href: '/s/dev/dm/orbit', unread: false },
        { href: '/s/dev/chats/eng', unread: false },
        { href: '/s/dev/chats/sec', unread: true },
        { href: '/s/dev/tasks/ENG-1', unread: true },
        { href: '/s/dev/chats/dm-ada', unread: true },
    ]);
});

test('Alt+Down goes to the next unread row below the open one, wrapping at the end', () => {
    expect(nextUnreadHref(rows, '/s/dev/chats/eng', 'next')).toBe('/s/dev/chats/sec');
    expect(nextUnreadHref(rows, '/s/dev/chats/sec', 'next')).toBe('/s/dev/tasks/ENG-1');
    expect(nextUnreadHref(rows, '/s/dev/chats/dm-ada', 'next')).toBe('/s/dev/chats/dm-forge');
    expect(nextUnreadHref(rows, '/s/dev', 'next')).toBe('/s/dev/chats/dm-forge');
});

test('Alt+Up goes to the previous unread row, and nothing unread goes nowhere', () => {
    expect(nextUnreadHref(rows, '/s/dev/chats/sec', 'previous')).toBe('/s/dev/chats/dm-forge');
    expect(nextUnreadHref(rows, '/s/dev', 'previous')).toBe('/s/dev/chats/dm-ada');
    expect(
        nextUnreadHref(
            rows.map((row) => ({ ...row, unread: false })),
            '/s/dev',
            'next'
        )
    ).toBeNull();
});

test('Projects walk in the order they were dragged to since the sidebar mounted', () => {
    const reordered = walkRows({
        channelOrder: ['sec', 'eng'],
        chats,
        previews,
        sections: [{ chatIds: ['eng', 'sec'], kind: 'projects', teamRoomId: null }],
        slug: 'dev',
    });
    expect(reordered.map((row) => row.href)).toEqual(['/s/dev/chats/sec', '/s/dev/chats/eng']);
});

test('the team room walks first among the Projects, ahead of any reorder', () => {
    const withAll = [chat({ id: 'all', isAll: true, kind: 'channel', unreadCount: 3 }), ...chats];
    const walk = walkRows({
        channelOrder: ['sec', 'eng'],
        chats: withAll,
        previews: [],
        sections: buildCapySidebar({
            agentIds: ['forge'],
            chats: withAll,
            openTasks: [],
            unreadPreviews: [],
            viewerUserId: 'zach',
        }),
        slug: 'dev',
    });
    expect(walk.map((row) => row.href)).toEqual([
        '/s/dev/chats/dm-forge',
        '/s/dev/chats/all',
        '/s/dev/chats/sec',
        '/s/dev/chats/eng',
        '/s/dev/chats/dm-ada',
    ]);
});
