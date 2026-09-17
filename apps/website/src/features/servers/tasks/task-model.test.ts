import { expect, test } from 'bun:test';
import type { Agent, TaskListItem } from '@haus/api';
import { testChat } from '../../chats/chat-fixtures.ts';
import { testAgent } from '../../members/agent-fixtures.ts';
import { humanDirectory } from '../human-identity.ts';
import {
    filterTasks,
    groupTasks,
    groupTasksForList,
    resolveTaskView,
    taskChatOptions,
    taskClaimAction,
    toTaskItem,
} from './task-model.ts';

const humans = humanDirectory([]);
test('projects a task from its canonical message', () => {
    const task = toTaskItem(item(), humans);

    expect(task.id).toBe('message_one');
    expect(task.title).toBe('Ship the Server board');
    expect(task.threadChatId).toBe('thread_one');
    expect(task.chatLabel).toBe('#all');
    expect(task.claimedAt).toBeNull();
    expect(task.threadSummary.replyCount).toBe(3);
});

test('a task title reads references by label, not by target', () => {
    const task = toTaskItem(
        item({
            content:
                'Ask [@Blippy](agent://agt_blippy) to fix\nthe avatar upload in [#product](chat://cht_one)',
        }),
        humans
    );

    expect(task.title).toBe('Ask @Blippy to fix the avatar upload in #product');
});

test('filters tasks by lifecycle without a second content store', () => {
    const todo = toTaskItem(item(), humans);
    const done = { ...todo, id: 'message_two', number: 2, status: 'done' as const, title: 'Docs' };

    expect(filterTasks([todo, done], { view: 'active' })).toEqual([todo]);
    expect(filterTasks([todo, done], { view: 'all' })).toEqual([todo, done]);
});

test('lets an explicit status outrank the resting active view', () => {
    const todo = toTaskItem(item(), humans);
    const done = { ...todo, id: 'message_two', number: 2, status: 'done' as const };
    const closed = { ...todo, id: 'message_three', number: 3, status: 'closed' as const };

    expect(filterTasks([todo, done, closed], { status: 'done', view: 'active' })).toEqual([done]);
    expect(filterTasks([todo, done, closed], { status: 'closed', view: 'active' })).toEqual([
        closed,
    ]);
    expect(filterTasks([todo, done, closed], { status: 'todo', view: 'active' })).toEqual([todo]);
    expect(filterTasks([todo, done, closed], { status: null, view: 'active' })).toEqual([todo]);
});

test('filters tasks by label id', () => {
    const labeled = {
        ...toTaskItem(item(), humans),
        labels: [{ color: 'red' as const, id: 'lbl_one', name: 'Bug' }],
    };
    const bare = { ...toTaskItem(item(), humans), id: 'message_two', labels: [], number: 2 };

    expect(filterTasks([labeled, bare], { labelId: 'lbl_one', view: 'all' })).toEqual([labeled]);
    expect(filterTasks([labeled, bare], { labelId: null, view: 'all' })).toEqual([labeled, bare]);
});

test('groups every lifecycle column in stable order', () => {
    const groups = groupTasks([toTaskItem(item(), humans)]);

    expect(groups.map((group) => group.status)).toEqual([
        'todo',
        'in_progress',
        'in_review',
        'done',
        'closed',
    ]);
    expect(groups[0]?.tasks).toHaveLength(1);
});

test('rests on the active view so finished work stays out of the default page', () => {
    expect(resolveTaskView(null)).toBe('active');
    expect(resolveTaskView('all')).toBe('all');
    expect(resolveTaskView('unassigned')).toBe('unassigned');
});

test('leads the list with the tasks waiting on a person', () => {
    const groups = groupTasksForList([toTaskItem(item(), humans)]);

    expect(groups.map((group) => group.status)).toEqual([
        'in_review',
        'todo',
        'in_progress',
        'done',
        'closed',
    ]);
    expect(groups[0]?.title).toBe('Needs your review');
    expect(groups[1]?.title).toBe('Todo');
});

test('orders each status group by priority, urgent first and unset last', () => {
    const base = toTaskItem(item(), humans);
    const none = { ...base, id: 'message_none', number: 2 };
    const low = { ...base, id: 'message_low', number: 3, priority: 'low' as const };
    const urgent = { ...base, id: 'message_urgent', number: 4, priority: 'urgent' as const };

    const groups = groupTasks([none, low, urgent]);

    expect(groups[0]?.tasks.map((task) => task.id)).toEqual([
        'message_urgent',
        'message_low',
        'message_none',
    ]);
});

test('projects the assignee avatar from the agent directory', () => {
    const assigned = {
        ...item(),
        task: { ...item().task, assigneeAgentId: 'agent_owner' },
    };

    const task = toTaskItem(assigned, humans, [agent()]);

    expect(task.assigneeLabel).toBe('Fen');
    expect(task.assigneeAvatarUrl).toBe('/api/avatars/avt_fen');
    expect(toTaskItem(item(), humans).assigneeAvatarUrl).toBeNull();
});

test('shows claim controls only when the viewer can perform the action', () => {
    const task = toTaskItem(item(), humans);

    expect(taskClaimAction(task, 'user_viewer')).toBe('claim');
    expect(
        taskClaimAction({ ...task, assigneeUserId: 'user_viewer', claimedAt: null }, 'user_viewer')
    ).toBe('claim-reservation');
    expect(
        taskClaimAction(
            { ...task, assigneeUserId: 'user_viewer', claimedAt: '2026-07-26T12:00:00.000Z' },
            'user_viewer'
        )
    ).toBe('unclaim');
    expect(
        taskClaimAction(
            { ...task, assigneeUserId: 'user_other', claimedAt: '2026-07-26T12:00:00.000Z' },
            'user_viewer'
        )
    ).toBeNull();
    expect(taskClaimAction({ ...task, status: 'done' }, 'user_viewer')).toBeNull();
    expect(taskClaimAction({ ...task, assigneeAgentId: 'agent_owner' }, 'user_viewer')).toBeNull();
});

test('treats Agent-owned tasks as assigned in task filters', () => {
    const task = { ...toTaskItem(item(), humans), assigneeAgentId: 'agent_owner' };

    expect(filterTasks([task], { view: 'unassigned' })).toEqual([]);
});

test('offers writable Channels and DMs as task creation work surfaces', () => {
    expect(
        taskChatOptions(
            [
                testChat({
                    id: 'chat_channel',
                    isAll: true,
                    name: 'all',
                    participantUserIds: ['user_viewer'],
                }),
                testChat({
                    id: 'chat_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer', 'user_peer'],
                    peerUserId: 'user_peer',
                }),
                testChat({
                    id: 'chat_agent_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer'],
                    peerAgentDisplayName: 'Cove',
                    peerAgentId: 'agent_cove',
                }),
                testChat({
                    id: 'chat_retired_agent_dm',
                    kind: 'dm',
                    name: null,
                    participantUserIds: ['user_viewer'],
                    peerAgentDisplayName: 'Fen',
                    peerAgentId: 'agent_fen',
                    peerAgentRetired: true,
                }),
            ],
            humans
        )
    ).toEqual([
        { id: 'chat_channel', label: '#all' },
        { id: 'chat_dm', label: 'DM · Human r_peer' },
        { id: 'chat_agent_dm', label: 'DM · Cove' },
    ]);
});

test('identifies a DM task by its peer', () => {
    expect(
        toTaskItem(
            {
                ...item(),
                chatKind: 'dm',
                chatName: null,
                chatPeerUserId: 'user_peer',
            },
            humans
        ).chatLabel
    ).toBe('DM · Human r_peer');
});

test('a task in an Agent DM reads as a DM without inventing a human peer', () => {
    expect(
        toTaskItem({ ...item(), chatKind: 'dm', chatName: null, chatPeerUserId: null }, humans)
            .chatLabel
    ).toBe('DM');
});

function agent(): Agent {
    return testAgent({
        avatarUrl: '/api/avatars/avt_fen',
        createdAt: '2026-07-26T12:00:00.000Z',
        effectiveModelId: null,
        effectiveReasoningEffort: null,
        effectiveReportedAt: null,
        effectiveRuntimeId: null,
        hausAgent: {
            appliedAt: null,
            appliedVersion: null,
            currentVersion: '1.0.0',
            status: 'pending',
        },
        id: 'agent_owner',
        status: 'pending',
    });
}

function item(overrides: { content?: string } = {}): TaskListItem {
    return {
        chatKind: 'channel',
        chatName: 'all',
        chatPeerUserId: null,
        message: {
            attachments: [],
            author: { kind: 'human', userId: 'user_one' },
            body: { kind: 'text' },
            chatId: 'chat_one',
            content: overrides.content ?? 'Ship the Server board',
            createdAt: '2026-07-26T12:00:00.000Z',
            id: 'message_one',
            nonce: 'nonce_one',
            reactions: [],
            reply: null,
            runId: null,
            sequence: 1,
            serverId: 'server_one',
            sessionGeneration: null,
        },
        task: {
            assigneeAgentId: null,
            assigneeUserId: null,
            chatId: 'chat_one',
            claimedAt: null,
            createdAt: '2026-07-26T12:00:00.000Z',
            createdByAgentId: null,
            createdByUserId: 'user_one',
            labels: [],
            live: false,
            messageId: 'message_one',
            number: 1,
            origin: 'composed',
            priority: 'none',
            status: 'todo',
            threadChatId: 'thread_one',
            tier: 'tracked',
            updatedAt: '2026-07-26T12:00:00.000Z',
            version: 1,
        },
        threadSummary: {
            anchorMessageId: 'message_one',
            followed: false,
            latestReplyAt: '2026-07-26T12:05:00.000Z',
            recentReplies: [],
            replyCount: 3,
            threadChatId: 'thread_one',
            unreadCount: 2,
        },
    };
}
