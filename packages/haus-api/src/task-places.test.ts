import { expect, test } from 'bun:test';
import { agentInboxItemSchema } from './agent-inbox.ts';
import { agentTaskListQuerySchema } from './agent-task.ts';
import { formatTaskTarget, TASK_TARGET_PATTERN } from './agent-task-refusals.ts';
import { chatMessagePageSchema } from './chat.ts';
import { taskSetStateInputSchema } from './task-input.ts';
import { taskKeyCreateInputSchema } from './task-key-ledger.ts';
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

test('a Task preview carries its state and at most three recent messages', () => {
    const preview = {
        chatId: 'cht_task',
        followed: true,
        key: 'SEC-12',
        messageCount: 4,
        originMessageId: 'msg_origin',
        recentMessages: [],
        state: 'open' as const,
        taskId: 'tsk_12',
        title: 'Rotate the deploy key',
        unreadCount: 2,
    };
    expect(taskPreviewSchema.parse(preview)).toEqual(preview);
    expect(() => taskPreviewSchema.parse({ ...preview, state: 'active' })).toThrow();
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

test('state changes and key-ledger entries validate their shapes', () => {
    const setState = {
        expectedVersion: 2,
        serverId: 'srv_1',
        state: 'done' as const,
        taskId: 'tsk_12',
    };
    expect(taskSetStateInputSchema.parse(setState)).toEqual(setState);
    expect(() => taskSetStateInputSchema.parse({ ...setState, state: 'closed' })).toThrow();
    expect(taskKeyCreateInputSchema.parse({ key: 'SEC', serverId: 'srv_1' }).key).toBe('SEC');
    expect(() => taskKeyCreateInputSchema.parse({ key: 'sec', serverId: 'srv_1' })).toThrow();
});

test('the Agent Task list filters by state and key, as a comma list or repeated', () => {
    expect(agentTaskListQuerySchema.parse({ key: 'SEC', state: 'done,canceled' })).toEqual({
        key: 'SEC',
        state: ['done', 'canceled'],
    });
    expect(agentTaskListQuerySchema.parse({ state: ['todo', 'open,done'] }).state).toEqual([
        'todo',
        'open',
        'done',
    ]);
    expect(agentTaskListQuerySchema.parse({ category: 'active' })).toEqual({});
    expect(agentTaskListQuerySchema.safeParse({ state: 'finished' }).success).toBe(false);
    expect(agentTaskListQuerySchema.safeParse({ key: 'sec' }).success).toBe(false);
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
        target: 'task:SEC-12',
    } as const;
    expect(agentInboxItemSchema.parse(item)).toEqual(item);
    expect(agentInboxItemSchema.safeParse({ ...item, sequence: 3 }).success).toBe(false);
});

test('a Task send target is task: and its key', () => {
    expect(formatTaskTarget('SEC-12')).toBe('task:SEC-12');
    expect(TASK_TARGET_PATTERN.test('task:SEC-12')).toBe(true);
    expect(TASK_TARGET_PATTERN.test('task:sec-12')).toBe(false);
});
