import { expect, test } from 'bun:test';
import { agentInboxItemSchema } from './agent-inbox.ts';
import { formatTaskTarget, TASK_TARGET_PATTERN } from './agent-task-refusals.ts';
import { agentTaskListQuerySchema } from './agent-task.ts';
import { chatMessagePageSchema } from './chat.ts';
import { taskArchiveInputSchema } from './task-input.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { taskPreviewSchema } from './task-preview.ts';

test('a message page defaults its Task previews to none', () => {
    const page = chatMessagePageSchema.parse({
        messages: [],
        nextAfterSequence: null,
        nextBeforeSequence: null,
        scannedThroughSequence: 0,
    });
    expect(page.tasks).toEqual([]);
});

test('a Task preview carries its archive time and at most three recent messages', () => {
    const preview = {
        agentId: 'agt_crew',
        archivedAt: null,
        chatId: 'cht_task',
        followed: true,
        messageCount: 4,
        model: 'gpt-5.6-sol',
        originMessageId: 'msg_origin',
        recentMessages: [],
        shortId: 'k3mq7xta',
        taskId: 'tsk_12',
        title: 'Rotate the deploy key',
        unreadCount: 2,
    };
    expect(taskPreviewSchema.parse(preview)).toEqual(preview);
    expect(() => taskPreviewSchema.parse({ ...preview, state: 'open' })).toThrow();
    const reply = {
        authorAgentId: null,
        authorUserId: 'usr_zach',
        content: 'hi',
        createdAt: '2026-11-17T12:00:00.000Z',
        id: 'msg_1',
    };
    expect(() =>
        taskPreviewSchema.parse({ ...preview, recentMessages: [reply, reply, reply, reply] })
    ).toThrow();
});

test('archive inputs and Project keys validate their shapes', () => {
    const archive = { expectedVersion: 2, serverId: 'srv_1', taskId: 'tsk_12' };
    expect(taskArchiveInputSchema.parse(archive)).toEqual(archive);
    expect(() => taskArchiveInputSchema.parse({ ...archive, state: 'done' })).toThrow();
    expect(taskKeyPrefixSchema.parse('SEC')).toBe('SEC');
    expect(() => taskKeyPrefixSchema.parse('sec')).toThrow();
});

test('the Agent Task list filters by scope, archive and Project', () => {
    expect(
        agentTaskListQuerySchema.parse({ all: 'true', archived: 'false', project: 'SEC' })
    ).toEqual({ all: true, archived: false, project: 'SEC' });
    expect(agentTaskListQuerySchema.parse({ state: 'open' })).toEqual({});
    expect(agentTaskListQuerySchema.safeParse({ all: 'yes' }).success).toBe(false);
    expect(agentTaskListQuerySchema.safeParse({ project: 'sec' }).success).toBe(false);
});

test('a pull request notice with no Run is a system attention with no Chat cursor', () => {
    const item = {
        chatId: 'cht_task',
        content: 'Pull request acme/api#7 is ready for review (head abc1234).',
        createdAt: '2026-11-17T12:00:00.000Z',
        id: 'acme/api#7:ready_for_review:abc1234',
        pullRequestNotice: {
            change: 'ready_for_review',
            url: 'https://github.com/acme/api/pull/7',
        },
        senderHandle: 'haus',
        senderType: 'system',
        sequence: 0,
        target: 'task:k3mq7xta',
    } as const;
    expect(agentInboxItemSchema.parse(item)).toEqual(item);
    expect(agentInboxItemSchema.safeParse({ ...item, sequence: 3 }).success).toBe(false);
});

test('a Task target is task: and its short id', () => {
    expect(formatTaskTarget('k3mq7xta')).toBe('task:k3mq7xta');
    expect(TASK_TARGET_PATTERN.test('task:k3mq7xta')).toBe(true);
    expect(TASK_TARGET_PATTERN.test('task:SEC-12')).toBe(false);
    expect(TASK_TARGET_PATTERN.test('task:k3mq7xtu')).toBe(false);
});
