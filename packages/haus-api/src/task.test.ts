import { expect, test } from 'bun:test';
import { agentDeliveryRecordSchema, isChatlessInboxSource } from './agent-deliveries.ts';
import { type AgentTurnTrigger, agentTurnTriggerSchema } from './agent-turn-trigger.ts';
import { chatMessageSchema } from './chat.ts';
import {
    type Task,
    taskAssigneeSchema,
    taskDetailSchema,
    taskMessagePlaceSchema,
    taskSchema,
} from './task.ts';
import {
    taskAssignInputSchema,
    taskCreateInputSchema,
    taskGetInputSchema,
    taskListInputSchema,
    taskUpdateInputSchema,
} from './task-input.ts';
import { formatTaskKey, parseTaskKey, taskKeySchema, taskLinkSchema } from './task-key.ts';

const task: Task = {
    assignee: { agentId: 'agt_zero', kind: 'agent' },
    boardId: 'brd_sec',
    category: 'todo',
    columnId: 'col_todo',
    completedAt: null,
    createdAt: '2026-11-04T12:00:00.000Z',
    createdBy: { kind: 'user', userId: 'usr_zach' },
    description: 'Rotate the leaked key.',
    dueOn: '2026-11-07',
    id: 'tsk_12',
    key: 'SEC-12',
    labelIds: ['lbl_security'],
    number: 12,
    priority: 'high',
    serverId: 'srv_1',
    title: 'Rotate the deploy key',
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 3,
};

test('task keys are a board key and a positive number', () => {
    expect(formatTaskKey('SEC', 12)).toBe('SEC-12');
    expect(parseTaskKey('SEC-12')).toEqual({ boardKey: 'SEC', number: 12 });
    for (const key of [
        'sec-12',
        'SEC-0',
        'SEC-012',
        'SEC12',
        'SEC-',
        'S-1',
        'SECURE-1',
        'SEC-1a',
    ]) {
        expect(parseTaskKey(key)).toBeNull();
        expect(taskKeySchema.safeParse(key).success).toBe(false);
    }
    expect(parseTaskKey('SEC-99999999999999999999')).toBeNull();
});

test('a Task has at most one assignee, a person or an Agent', () => {
    expect(taskSchema.parse(task)).toEqual(task);
    expect(taskSchema.parse({ ...task, assignee: null }).assignee).toBeNull();
    expect(taskAssigneeSchema.safeParse({ kind: 'user', userId: 'usr_ada' }).success).toBe(true);
    expect(
        taskAssigneeSchema.safeParse({ agentId: 'agt_zero', kind: 'user', userId: 'usr_ada' })
            .success
    ).toBe(false);
    expect(taskAssigneeSchema.safeParse({ agentId: 'agt_zero', userId: 'usr_ada' }).success).toBe(
        false
    );
    expect(taskSchema.safeParse({ ...task, assignee: [task.assignee] }).success).toBe(false);
    expect(
        taskSchema.safeParse({ ...task, createdBy: { agentId: 'a', kind: 'user', userId: 'u' } })
            .success
    ).toBe(false);
});

test('completedAt is set exactly while a Task sits in a closed column', () => {
    const doneAt = '2026-11-05T09:00:00.000Z';
    expect(taskSchema.safeParse({ ...task, category: 'done', completedAt: doneAt }).success).toBe(
        true
    );
    expect(
        taskSchema.safeParse({ ...task, category: 'canceled', completedAt: doneAt }).success
    ).toBe(true);
    expect(taskSchema.safeParse({ ...task, category: 'done' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, completedAt: doneAt }).success).toBe(false);
});

test('a Task record keeps its derived key consistent and its fields bounded', () => {
    expect(taskSchema.safeParse({ ...task, key: 'SEC-13' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, key: 'sec-12' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, title: 'x'.repeat(201) }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, description: 'x'.repeat(20_001) }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, dueOn: '2026-11-07T00:00:00Z' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, priority: 'p0' }).success).toBe(false);
    expect(
        taskDetailSchema.safeParse({ ...task, key: 'SEC-13', mentions: [], reminders: [] }).success
    ).toBe(false);
    expect(
        taskDetailSchema.parse({
            ...task,
            mentions: [
                {
                    authorLabel: 'Zero',
                    chatId: 'cht_security',
                    createdAt: '2026-11-04T12:01:00.000Z',
                    excerpt: 'Filed SEC-12 for the leaked key.',
                    messageId: 'msg_1',
                    place: {
                        chatId: 'cht_security',
                        chatKind: 'channel',
                        chatName: 'security',
                        threadAnchorMessageId: null,
                    },
                },
            ],
            reminders: [
                {
                    anchorChatId: 'cht_security',
                    kind: 'once',
                    nextFireAt: '2026-11-07T15:00:00.000Z',
                    reminderId: 'rem_1',
                    title: 'Check SEC-12',
                },
            ],
        }).mentions
    ).toHaveLength(1);
});

test("a message's place names a Channel and never a DM's peer", () => {
    const channel = {
        chatId: 'cht_security',
        chatKind: 'channel',
        chatName: 'security',
        threadAnchorMessageId: 'msg_anchor',
    };
    const dm = { ...channel, chatKind: 'dm', chatName: null };
    expect(taskMessagePlaceSchema.safeParse(channel).success).toBe(true);
    expect(taskMessagePlaceSchema.safeParse(dm).success).toBe(true);
    expect(taskMessagePlaceSchema.safeParse({ ...channel, chatName: null }).success).toBe(false);
    expect(taskMessagePlaceSchema.safeParse({ ...dm, chatName: 'Ada' }).success).toBe(false);
});

test('task inputs reject illegal assignments and empty patches', () => {
    const create = { boardId: 'brd_sec', serverId: 'srv_1', title: '  Rotate the key  ' };
    expect(taskCreateInputSchema.parse(create).title).toBe('Rotate the key');
    expect(taskCreateInputSchema.safeParse({ ...create, title: '   ' }).success).toBe(false);
    expect(
        taskCreateInputSchema.safeParse({ ...create, labelIds: ['lbl_1', 'lbl_1'] }).success
    ).toBe(false);
    expect(
        taskCreateInputSchema.safeParse({ ...create, assignee: { agentId: 'a', userId: 'u' } })
            .success
    ).toBe(false);
    const mutation = { expectedVersion: 3, serverId: 'srv_1', taskId: 'tsk_12' };
    expect(taskAssignInputSchema.safeParse({ ...mutation, assignee: null }).success).toBe(true);
    expect(taskAssignInputSchema.safeParse(mutation).success).toBe(false);
    expect(taskUpdateInputSchema.safeParse({ ...mutation, patch: {} }).success).toBe(false);
    expect(taskUpdateInputSchema.safeParse({ ...mutation, patch: { dueOn: null } }).success).toBe(
        true
    );
    expect(
        taskUpdateInputSchema.safeParse({ ...mutation, patch: { columnId: 'col_done' } }).success
    ).toBe(false);
});

test('tasks are addressed by id or key, and listed by one assignee filter', () => {
    expect(taskGetInputSchema.safeParse({ key: 'SEC-12', serverId: 'srv_1' }).success).toBe(true);
    expect(taskGetInputSchema.safeParse({ serverId: 'srv_1', taskId: 'tsk_12' }).success).toBe(
        true
    );
    expect(
        taskGetInputSchema.safeParse({ key: 'SEC-12', serverId: 'srv_1', taskId: 'tsk_12' }).success
    ).toBe(false);
    expect(taskGetInputSchema.safeParse({ key: 'sec-12', serverId: 'srv_1' }).success).toBe(false);
    for (const assignee of [{ userId: 'usr_ada' }, { agentId: 'agt_zero' }, 'none']) {
        expect(taskListInputSchema.safeParse({ assignee, serverId: 'srv_1' }).success).toBe(true);
    }
    expect(
        taskListInputSchema.safeParse({
            assignee: { agentId: 'agt_zero', userId: 'usr_ada' },
            serverId: 'srv_1',
        }).success
    ).toBe(false);
    expect(taskListInputSchema.safeParse({ categories: [], serverId: 'srv_1' }).success).toBe(
        false
    );
});

test('chat messages carry resolved task links, defaulting to none', () => {
    const link = { key: 'SEC-12', taskId: 'tsk_12', text: 'SEC-12' };
    expect(taskLinkSchema.parse(link)).toEqual(link);
    expect(taskLinkSchema.safeParse({ ...link, text: '' }).success).toBe(false);
    expect(chatMessageSchema.shape.taskLinks.parse(undefined)).toEqual([]);
    expect(chatMessageSchema.shape.taskLinks.parse([link])).toEqual([link]);
});

test('a task assignment wakes the Agent without a Chat', () => {
    expect(isChatlessInboxSource('task_assignment')).toBe(true);
    const delivery = {
        acceptedAt: null,
        agentId: 'agt_zero',
        chatId: null,
        createdAt: '2026-11-04T12:00:00.000Z',
        messageId: null,
        seenAt: null,
        servedAt: null,
        source: 'task_assignment',
        state: 'queued',
        turnId: null,
        workId: 'wrk_1',
    } as const;
    expect(agentDeliveryRecordSchema.safeParse(delivery).success).toBe(true);
    expect(agentDeliveryRecordSchema.safeParse({ ...delivery, chatId: 'cht_1' }).success).toBe(
        false
    );
    const trigger: AgentTurnTrigger = {
        key: 'SEC-12',
        kind: 'task',
        taskId: 'tsk_12',
        title: 'Rotate the key',
    };
    expect(agentTurnTriggerSchema.parse(trigger)).toEqual(trigger);
    expect(agentTurnTriggerSchema.safeParse({ ...trigger, chatId: 'cht_1' }).success).toBe(false);
    expect(agentTurnTriggerSchema.safeParse({ kind: 'task', taskId: 'tsk_12' }).success).toBe(
        false
    );
});
