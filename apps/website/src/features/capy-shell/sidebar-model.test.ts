import { expect, test } from 'bun:test';
import type { Chat, ChatMessage, ChatUnreadPreview, Task } from '@haus/api';
import {
    buildCapySidebar,
    type CapySidebarSources,
    openTaskRows,
    progressLineParts,
    projectRows,
} from './sidebar-model.ts';

const chat = (fields: Partial<Chat> & Pick<Chat, 'id' | 'kind'>) =>
    ({
        color: null,
        icon: null,
        name: null,
        participantAgentIds: [],
        peerAgentId: null,
        peerUserId: null,
        unreadCount: 0,
        ...fields,
    }) as Chat;

const task = (id: string, key: string, createdAt: string, chatId: string | null = null) =>
    ({
        assignee: { agentId: 'forge', kind: 'agent' },
        chatId,
        createdAt,
        id,
        key,
        state: 'open',
        title: `Title ${key}`,
    }) as Task;

const preview = (chatId: string, contents: string[]) =>
    ({
        chatId,
        earlierUnreadCount: 1,
        messages: contents.map((content) => ({ content }) as ChatMessage),
        task: null,
    }) as ChatUnreadPreview;

const sources = (fields: Partial<CapySidebarSources>) =>
    ({
        agents: [
            { availability: 'working', avatarUrl: null, displayName: 'Forge', id: 'forge' },
            { availability: 'idle', avatarUrl: null, displayName: 'Cove', id: 'cove' },
        ],
        channelOrder: [],
        chats: [],
        members: [{ avatarUrl: null, displayName: 'Zach', userId: 'zach' }],
        openTasks: [],
        unreadPreviews: [],
        viewerUserId: 'zach',
        ...fields,
    }) satisfies CapySidebarSources;

test('the sidebar runs Captains, Projects, open Tasks, then People', () => {
    const sections = buildCapySidebar(
        sources({
            chats: [
                chat({ id: 'eng', kind: 'channel', name: 'eng' }),
                chat({ id: 'dm-ada', kind: 'dm', peerUserId: 'ada', unreadCount: 2 }),
            ],
            openTasks: [task('t1', 'ENG-1', '2026-11-18T10:00:00.000Z')],
        })
    );
    expect(sections.map((section) => section.kind)).toEqual([
        'captains',
        'projects',
        'open-tasks',
        'people',
    ]);
});

test('People and open Tasks are hidden when there are none', () => {
    const sections = buildCapySidebar(
        sources({
            chats: [
                chat({ id: 'eng', kind: 'channel', name: 'eng' }),
                chat({ id: 'dm-forge', kind: 'dm', peerAgentId: 'forge' }),
            ],
        })
    );
    expect(sections.map((section) => section.kind)).toEqual(['captains', 'projects']);
});

test('a Captain tile is working while its Agent works and counts its DM unread', () => {
    const [captains] = buildCapySidebar(
        sources({
            chats: [chat({ id: 'dm-forge', kind: 'dm', peerAgentId: 'forge', unreadCount: 3 })],
        })
    );
    expect(captains).toEqual({
        kind: 'captains',
        tiles: [
            {
                agentId: 'forge',
                avatarUrl: null,
                dmChatId: 'dm-forge',
                name: 'Forge',
                unreadCount: 3,
                working: true,
            },
            {
                agentId: 'cove',
                avatarUrl: null,
                dmChatId: null,
                name: 'Cove',
                unreadCount: 0,
                working: false,
            },
        ],
    });
});

test("Projects follow the stored order and carry their channel's Captains as live data", () => {
    const rows = projectRows(
        sources({
            channelOrder: ['sec'],
            chats: [
                chat({ id: 'eng', kind: 'channel', name: 'eng', participantAgentIds: ['forge'] }),
                chat({ id: 'sec', kind: 'channel', name: 'sec', unreadCount: 4 }),
            ],
        })
    );
    expect(rows.map((row) => [row.name, row.captainIds, row.unreadCount])).toEqual([
        ['sec', { source: 'live', value: [] }, 4],
        ['eng', { source: 'live', value: ['forge'] }, 0],
    ]);
});

test('a Task that @mentions you in an unread message waits on you and sorts first', () => {
    const rows = openTaskRows(
        sources({
            openTasks: [
                task('t1', 'ENG-1', '2026-11-18T12:00:00.000Z', 'c1'),
                task('t2', 'SEC-2', '2026-11-18T09:00:00.000Z', 'c2'),
                task('t3', 'ENG-3', '2026-11-18T11:00:00.000Z', 'c3'),
            ],
            unreadPreviews: [
                preview('c2', ['[@Zach](user://zach) can you approve the rotation?']),
                preview('c3', ['[@Ada](user://ada) take a look']),
            ],
        })
    );
    expect(rows.map((row) => [row.key, row.line.kind, row.unreadCount])).toEqual([
        ['SEC-2', 'waiting', 2],
        ['ENG-1', 'progress', 0],
        ['ENG-3', 'progress', 2],
    ]);
    expect(rows[0]?.line).toEqual({ kind: 'waiting', on: 'Zach' });
});

test('Worker counts and places are placeholders marked for W2', () => {
    const [row] = openTaskRows(
        sources({ openTasks: [task('t2', 'ENG-2', '2026-11-18T12:00:00Z')] })
    );
    expect(row?.line).toEqual({
        assignee: 'Forge',
        kind: 'progress',
        workers: {
            replacedBy: 'W2',
            source: 'placeholder',
            value: { count: 1, places: ['cursor'] },
        },
    });
});

test('the progress line drops parts it has nothing for', () => {
    expect(
        progressLineParts({
            assignee: 'Forge',
            kind: 'progress',
            workers: { source: 'live', value: { count: 2, places: ['mini', 'cursor'] } },
        })
    ).toEqual(['Forge', '2 workers', 'mini, cursor']);
    expect(
        progressLineParts({
            assignee: null,
            kind: 'progress',
            workers: { source: 'live', value: { count: 0, places: [] } },
        })
    ).toEqual([]);
});
