import { expect, test } from 'bun:test';
import { chatMessageSchema } from './chat.ts';
import { taskGetInputSchema, taskListInputSchema, taskUpdateInputSchema } from './task-input.ts';
import { isTaskShortId, taskLinkSchema, taskShortIdSchema } from './task-short-id.ts';
import { type Task, taskDetailSchema, taskMessagePlaceSchema, taskSchema } from './task.ts';

const task: Task = {
    activity: 'idle',
    agentId: 'agt_task',
    archivedAt: null,
    captainId: null,
    chatId: 'cht_task',
    computerId: 'cmp_mini',
    createdAt: '2026-11-04T12:00:00.000Z',
    createdBy: { kind: 'user', userId: 'usr_zach' },
    description: 'Rotate the leaked key.',
    id: 'tsk_12',
    model: 'claude-opus-4-7',
    needsYou: false,
    origin: { chatId: 'cht_security', messageId: 'msg_origin' },
    projectId: 'cht_security',
    serverId: 'srv_1',
    shortId: 'k3mq7xta',
    title: 'Rotate the deploy key',
    titleCustom: false,
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 3,
};

test('a short id is 8 lowercase Crockford base32 characters', () => {
    expect(isTaskShortId('k3mq7xta')).toBe(true);
    expect(isTaskShortId('0123abcz')).toBe(true);
    for (const shortId of [
        'K3MQ7XTA',
        'k3mq7xt',
        'k3mq7xtaa',
        'k3mq7xti',
        'k3mq7xtl',
        'k3mq7xto',
    ]) {
        expect(isTaskShortId(shortId)).toBe(false);
        expect(taskShortIdSchema.safeParse(shortId).success).toBe(false);
    }
    expect(isTaskShortId('k3mq7xtu')).toBe(false);
});

test('a Task has a short id and an archive time, and no backlog fields', () => {
    expect(taskSchema.parse(task)).toEqual(task);
    const archived = { ...task, archivedAt: '2026-11-05T09:00:00.000Z' };
    expect(taskSchema.parse(archived).archivedAt).toBe(archived.archivedAt);
    for (const field of ['state', 'priority', 'dueOn', 'labelIds', 'assignee', 'key', 'number']) {
        expect(taskSchema.safeParse({ ...task, [field]: null }).success).toBe(false);
    }
    expect(taskSchema.safeParse({ ...task, shortId: 'SEC-12' }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, title: 'x'.repeat(201) }).success).toBe(false);
    expect(taskSchema.safeParse({ ...task, description: 'x'.repeat(20_001) }).success).toBe(false);
    expect(
        taskSchema.safeParse({ ...task, createdBy: { agentId: 'a', kind: 'user', userId: 'u' } })
            .success
    ).toBe(false);
});

test('a Task detail carries its Mentioned in and Reminders', () => {
    expect(
        taskDetailSchema.parse({
            ...task,
            descriptionContent: task.description,
            descriptionTaskLinks: [],
            followed: true,
            mentions: [
                {
                    authorLabel: 'Zero',
                    chatId: 'cht_security',
                    createdAt: '2026-11-04T12:01:00.000Z',
                    excerpt: 'Started a Task for the leaked key.',
                    messageId: 'msg_1',
                    place: { chatId: 'cht_security', chatKind: 'channel', chatName: 'security' },
                },
            ],
            pullRequests: [],
            reminders: [
                {
                    anchorChatId: 'cht_security',
                    kind: 'once',
                    nextFireAt: '2026-11-07T15:00:00.000Z',
                    reminderId: 'rem_1',
                    setBy: { agentId: 'agt_forge', displayName: 'Forge' },
                    title: 'Check the key',
                },
            ],
            unreadCount: 0,
        }).mentions
    ).toHaveLength(1);
});

test("a message's place names a Channel and never a DM's peer", () => {
    const channel = { chatId: 'cht_security', chatKind: 'channel', chatName: 'security' };
    const dm = { ...channel, chatKind: 'dm', chatName: null };
    expect(taskMessagePlaceSchema.safeParse(channel).success).toBe(true);
    expect(taskMessagePlaceSchema.safeParse(dm).success).toBe(true);
    expect(taskMessagePlaceSchema.safeParse({ ...channel, chatName: null }).success).toBe(false);
    expect(taskMessagePlaceSchema.safeParse({ ...dm, chatName: 'Ada' }).success).toBe(false);
});

test('task updates take a title or description and nothing else', () => {
    const mutation = { expectedVersion: 3, serverId: 'srv_1', taskId: 'tsk_12' };
    expect(taskUpdateInputSchema.safeParse({ ...mutation, patch: { title: 'New' } }).success).toBe(
        true
    );
    expect(taskUpdateInputSchema.safeParse({ ...mutation, patch: { title: '   ' } }).success).toBe(
        false
    );
    expect(taskUpdateInputSchema.safeParse({ ...mutation, patch: {} }).success).toBe(false);
    for (const patch of [{ priority: 'high' }, { dueOn: null }, { labelIds: [] }]) {
        expect(taskUpdateInputSchema.safeParse({ ...mutation, patch }).success).toBe(false);
    }
});

test('tasks are addressed by id or short id, and listed active or archived', () => {
    expect(taskGetInputSchema.safeParse({ serverId: 'srv_1', shortId: 'k3mq7xta' }).success).toBe(
        true
    );
    expect(taskGetInputSchema.safeParse({ serverId: 'srv_1', taskId: 'tsk_12' }).success).toBe(
        true
    );
    expect(
        taskGetInputSchema.safeParse({ serverId: 'srv_1', shortId: 'k3mq7xta', taskId: 'tsk_12' })
            .success
    ).toBe(false);
    expect(taskGetInputSchema.safeParse({ key: 'SEC-12', serverId: 'srv_1' }).success).toBe(false);
    expect(taskListInputSchema.safeParse({ archived: true, serverId: 'srv_1' }).success).toBe(true);
    expect(taskListInputSchema.safeParse({ serverId: 'srv_1', states: ['open'] }).success).toBe(
        false
    );
});

test('chat messages carry resolved task links, defaulting to none', () => {
    const link = { shortId: 'k3mq7xta', taskId: 'tsk_12', text: '[the key](task://tsk_12)' };
    expect(taskLinkSchema.parse(link)).toEqual(link);
    expect(taskLinkSchema.safeParse({ ...link, text: '' }).success).toBe(false);
    expect(taskLinkSchema.safeParse({ ...link, shortId: 'SEC-12' }).success).toBe(false);
    expect(chatMessageSchema.shape.taskLinks.parse(undefined)).toEqual([]);
    expect(chatMessageSchema.shape.taskLinks.parse([link])).toEqual([link]);
});
