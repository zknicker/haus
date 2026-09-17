import { expect, test } from 'bun:test';
import type { MessageTask, TaskListItem } from '@haus/api';
import { replaceTask } from './task-cache.ts';

test('replaces both task projections with the authoritative mutation result', () => {
    const item = taskItem();
    const task = { ...item.task, status: 'in_progress' as const, version: 2 };

    expect(replaceTask({ backgroundCount: 2, tasks: [item] }, task)).toEqual({
        backgroundCount: 2,
        tasks: [
            {
                ...item,
                message: { ...item.message, task },
                task,
            },
        ],
    });
});

function taskItem(): TaskListItem {
    const task: MessageTask = {
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
    };
    return {
        chatKind: 'channel',
        chatName: 'all',
        chatPeerUserId: null,
        message: {
            attachments: [],
            author: { kind: 'human', userId: 'user_one' },
            body: { kind: 'text' },
            chatId: 'chat_one',
            content: 'Task',
            createdAt: '2026-07-26T12:00:00.000Z',
            id: 'message_one',
            nonce: 'nonce_one',
            reactions: [],
            reply: null,
            runId: null,
            sequence: 1,
            serverId: 'server_one',
            sessionGeneration: null,
            task,
        },
        task,
        threadSummary: {
            anchorMessageId: 'message_one',
            followed: false,
            latestReplyAt: null,
            recentReplies: [],
            replyCount: 0,
            threadChatId: 'thread_one',
            unreadCount: 0,
        },
    };
}
