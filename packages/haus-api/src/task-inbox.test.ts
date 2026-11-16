import { expect, test } from 'bun:test';
import { linkedMessage } from './cloud-agent-work-fixture.ts';
import {
    type TaskInboxItem,
    taskInboxChangedEventSchema,
    taskInboxClearInputSchema,
    taskInboxItemSchema,
} from './task-inbox.ts';

const item: TaskInboxItem = {
    assignedAt: '2026-11-04T12:00:00.000Z',
    assignedBy: { id: 'agt_zero', kind: 'agent', label: 'Zero' },
    boardName: 'Security',
    contextMessage: null,
    contextPlace: null,
    task: {
        assignee: { kind: 'user', userId: 'usr_zach' },
        boardId: 'brd_sec',
        category: 'todo',
        columnId: 'col_todo',
        completedAt: null,
        createdAt: '2026-11-04T12:00:00.000Z',
        createdBy: { agentId: 'agt_zero', kind: 'agent' },
        description: '',
        dueOn: null,
        id: 'tsk_12',
        key: 'SEC-12',
        labelIds: [],
        number: 12,
        priority: 'none',
        serverId: 'srv_1',
        title: 'Rotate the deploy key',
        updatedAt: '2026-11-04T12:00:00.000Z',
        version: 1,
    },
};

test('a Task Inbox item names its assigner and an optional context message', () => {
    expect(taskInboxItemSchema.parse(item)).toEqual(item);
    const contextPlace = {
        chatId: 'cht_security',
        chatKind: 'channel' as const,
        chatName: 'security',
        threadAnchorMessageId: 'msg_anchor',
    };
    expect(
        taskInboxItemSchema.parse({ ...item, contextMessage: linkedMessage, contextPlace })
            .contextPlace
    ).toEqual(contextPlace);
    // A context message and its place come together.
    expect(taskInboxItemSchema.safeParse({ ...item, contextMessage: linkedMessage }).success).toBe(
        false
    );
    expect(taskInboxItemSchema.safeParse({ ...item, contextPlace }).success).toBe(false);
    expect(
        taskInboxItemSchema.safeParse({ ...item, assignedBy: { ...item.assignedBy, kind: 'bot' } })
            .success
    ).toBe(false);
    expect(taskInboxItemSchema.safeParse({ ...item, contextMessage: undefined }).success).toBe(
        false
    );
});

test('Task Inbox mutations and events stay id-only', () => {
    expect(
        taskInboxClearInputSchema.safeParse({ serverId: 'srv_1', taskId: 'tsk_12' }).success
    ).toBe(true);
    expect(taskInboxClearInputSchema.safeParse({ serverId: 'srv_1', key: 'SEC-12' }).success).toBe(
        false
    );
    const event = { serverId: 'srv_1', userId: 'usr_zach' };
    expect(taskInboxChangedEventSchema.parse(event)).toEqual(event);
    expect(taskInboxChangedEventSchema.safeParse({ ...event, task: item.task }).success).toBe(
        false
    );
});
