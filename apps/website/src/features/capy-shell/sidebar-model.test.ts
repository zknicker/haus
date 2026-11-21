import { expect, test } from 'bun:test';
import type { Chat, ChatMessage, ChatUnreadPreview, Task } from '@haus/api';
import {
    buildCapySidebar,
    type CapySidebarSources,
    openTaskSlots,
    projectIds,
    waitingChatIds,
} from './sidebar-layout.ts';
import { agentDm, captainTile, openTaskRow, taskUnread } from './sidebar-model.ts';

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

const sources = (fields: Partial<CapySidebarSources>) =>
    ({
        agentIds: ['forge', 'orbit'],
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
        { agentDmChatIds: {}, agentIds: ['forge', 'orbit'], kind: 'captains' },
        { chatIds: ['eng'], kind: 'projects' },
        { kind: 'open-tasks', tasks: [{ chatId: null, key: 'ENG-1', taskId: 't1' }] },
        { chatIds: ['dm-ada'], kind: 'people' },
    ]);
});

test('a new Haus with no Captains and no Projects keeps both headers with nothing below', () => {
    expect(buildCapySidebar(sources({ agentIds: [], chats: [] }))).toEqual([
        { agentDmChatIds: {}, agentIds: [], kind: 'captains' },
        { chatIds: [], kind: 'projects' },
    ]);
});

test('one Project and no Captain, or one Captain and no Project, keeps the empty header', () => {
    expect(
        buildCapySidebar(
            sources({ agentIds: [], chats: [chat({ id: 'eng', kind: 'channel', name: 'eng' })] })
        )
    ).toEqual([
        { agentDmChatIds: {}, agentIds: [], kind: 'captains' },
        { chatIds: ['eng'], kind: 'projects' },
    ]);
    expect(buildCapySidebar(sources({ agentIds: ['forge'], chats: [] }))).toEqual([
        { agentDmChatIds: {}, agentIds: ['forge'], kind: 'captains' },
        { chatIds: [], kind: 'projects' },
    ]);
});

test('#all is the team room in its own row above Projects, not a Project', () => {
    const sections = buildCapySidebar(
        sources({
            chats: [
                chat({ id: 'all', isAll: true, kind: 'channel', name: 'all' }),
                chat({ id: 'eng', kind: 'channel', name: 'eng' }),
            ],
        })
    );
    expect(sections).toEqual([
        { agentDmChatIds: {}, agentIds: ['forge', 'orbit'], kind: 'captains' },
        { chatId: 'all', kind: 'team-room' },
        { chatIds: ['eng'], kind: 'projects' },
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

test('a Captain tile shows its working state and counts its DM unread', () => {
    const chats = [chat({ id: 'dm-forge', kind: 'dm', peerAgentId: 'forge', unreadCount: 3 })];
    expect(captainTile(forge, agentDm(chats, 'forge'))).toEqual({
        agentId: 'forge',
        avatarUrl: null,
        dmChatId: 'dm-forge',
        name: 'Forge',
        presence: 'working',
        unreadCount: 3,
    });
    expect(captainTile({ ...forge, availability: 'idle' }, null)).toMatchObject({
        dmChatId: null,
        presence: null,
        unreadCount: 0,
    });
});

test('a Captain tile flags an Agent that needs attention or is paused', () => {
    expect(captainTile({ ...forge, availability: 'error' }, null).presence).toBe('error');
    expect(
        captainTile(
            { ...forge, availability: 'idle', wakePause: { reason: 'budget' } as never },
            null
        ).presence
    ).toBe('paused');
    expect(captainTile({ ...forge, availability: 'offline' }, null).presence).toBeNull();
});

test('Projects list in Server order; the sortable list applies the stored order', () => {
    const eng = chat({ id: 'eng', kind: 'channel', name: 'eng', participantAgentIds: ['forge'] });
    const sec = chat({ id: 'sec', kind: 'channel', name: 'sec', unreadCount: 4 });
    expect(projectIds([eng, sec])).toEqual(['eng', 'sec']);
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
    const waiting = openTaskRow({
        task: tasks[1] as Task,
        unread: taskUnread(previews[0], 'zach'),
    });
    expect([waiting.waitingOnYou, waiting.unreadCount]).toEqual([true, 2]);
    expect(taskUnread(previews[1], 'zach')).toEqual({ mentionsViewer: false, unreadCount: 2 });
});

test('an open Task row is one line: key, title, unread, and whether it waits on you', () => {
    expect(
        openTaskRow({
            task: task('t2', 'ENG-2', '2026-11-18T12:00:00Z', 'c2'),
            unread: taskUnread(undefined, 'zach'),
        })
    ).toEqual({
        chatId: 'c2',
        key: 'ENG-2',
        state: 'open',
        taskId: 't2',
        title: 'Title ENG-2',
        unreadCount: 0,
        waitingOnYou: false,
    });
});
