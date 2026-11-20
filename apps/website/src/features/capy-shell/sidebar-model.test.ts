import { expect, test } from 'bun:test';
import type { Chat, ChatMessage, ChatUnreadPreview, Task } from '@haus/api';
import {
    buildCapySidebar,
    type CapySidebarSources,
    openTaskSlots,
    projectIds,
    waitingChatIds,
} from './sidebar-layout.ts';
import {
    agentDm,
    assigneeName,
    captainTile,
    openTaskRow,
    progressLineParts,
    projectRow,
    taskUnread,
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

const forge = {
    availability: 'working',
    avatarUrl: null,
    displayName: 'Forge',
    id: 'forge',
} as const;
const members = [{ avatarUrl: null, displayName: 'Zach', userId: 'zach' }];

const sources = (fields: Partial<CapySidebarSources>) =>
    ({
        agentIds: ['forge', 'cove'],
        channelOrder: [],
        chats: [],
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
    expect(sections).toEqual([
        { agentDmChatIds: {}, agentIds: ['forge', 'cove'], kind: 'captains' },
        { chatIds: ['eng'], kind: 'projects' },
        { kind: 'open-tasks', tasks: [{ chatId: null, key: 'ENG-1', taskId: 't1' }] },
        { chatIds: ['dm-ada'], kind: 'people' },
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
    const chats = [chat({ id: 'dm-forge', kind: 'dm', peerAgentId: 'forge', unreadCount: 3 })];
    expect(captainTile(forge, agentDm(chats, 'forge'))).toEqual({
        agentId: 'forge',
        avatarUrl: null,
        dmChatId: 'dm-forge',
        name: 'Forge',
        unreadCount: 3,
        working: true,
    });
    expect(captainTile({ ...forge, availability: 'idle' }, null)).toMatchObject({
        dmChatId: null,
        unreadCount: 0,
        working: false,
    });
});

test('Projects follow the stored order and carry their unread count', () => {
    const eng = chat({ id: 'eng', kind: 'channel', name: 'eng', participantAgentIds: ['forge'] });
    const sec = chat({ id: 'sec', kind: 'channel', name: 'sec', unreadCount: 4 });
    expect(projectIds([eng, sec], ['sec'])).toEqual(['sec', 'eng']);
    expect(projectRow(sec).unreadCount).toBe(4);
});

test('a Task that @mentions you in an unread message waits on you and sorts first', () => {
    const previews = [
        preview('c2', ['[@Zach](user://zach) can you approve the rotation?']),
        preview('c3', ['[@Ada](user://ada) take a look']),
    ];
    const tasks = [
        task('t1', 'ENG-1', '2026-11-18T12:00:00.000Z', 'c1'),
        task('t2', 'SEC-2', '2026-11-18T09:00:00.000Z', 'c2'),
        task('t3', 'ENG-3', '2026-11-18T11:00:00.000Z', 'c3'),
    ];
    expect(openTaskSlots(tasks, waitingChatIds(previews, 'zach')).map((slot) => slot.key)).toEqual([
        'SEC-2',
        'ENG-1',
        'ENG-3',
    ]);
    const row = openTaskRow({
        assignee: 'Forge',
        task: tasks[1] as Task,
        unread: taskUnread(previews[0], 'zach'),
        viewerName: 'Zach',
    });
    expect([row.line, row.unreadCount]).toEqual([{ kind: 'waiting', on: 'Zach' }, 2]);
    expect(taskUnread(previews[1], 'zach')).toEqual({ mentionsViewer: false, unreadCount: 2 });
});

test('Worker counts and places are placeholders marked for W2', () => {
    const row = openTaskRow({
        assignee: assigneeName({ agentId: 'forge', kind: 'agent' }, [forge], members),
        task: task('t2', 'ENG-2', '2026-11-18T12:00:00Z'),
        unread: taskUnread(undefined, 'zach'),
        viewerName: 'Zach',
    });
    expect(row.line).toEqual({
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
