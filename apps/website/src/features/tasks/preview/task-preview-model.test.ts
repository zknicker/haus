import { expect, test } from 'bun:test';
import { taskPreviewCounts, taskPreviewLabel } from './task-preview-model.ts';

test('a preview counts its messages and, for a follower, what is new', () => {
    expect(taskPreviewCounts({ messageCount: 1, unreadCount: 0 })).toEqual({
        messages: '1 message',
        unread: null,
    });
    expect(taskPreviewCounts({ messageCount: 7, unreadCount: 2 })).toEqual({
        messages: '7 messages',
        unread: '2 new',
    });
});

test('a Task with no messages yet still previews, with no count', () => {
    expect(taskPreviewCounts({ messageCount: 0, unreadCount: 0 })).toEqual({
        messages: null,
        unread: null,
    });
    expect(
        taskPreviewLabel({
            key: 'SEC-13',
            messageCount: 0,
            state: 'todo',
            title: 'Audit tokens',
            unreadCount: 0,
        })
    ).toBe('Open task SEC-13, Audit tokens, Todo');
});

test('the open button names the Task, its state, and its counts', () => {
    expect(
        taskPreviewLabel({
            key: 'SEC-12',
            messageCount: 4,
            state: 'open',
            title: 'Rate-limit webhooks',
            unreadCount: 1,
        })
    ).toBe('Open task SEC-12, Rate-limit webhooks, Open, 4 messages, 1 new');
});
