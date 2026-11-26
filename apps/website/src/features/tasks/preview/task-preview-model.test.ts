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
            archivedAt: null,
            messageCount: 0,
            title: 'Audit tokens',
            unreadCount: 0,
        })
    ).toBe('Open task Audit tokens, Active');
});

test('the open button names the Task, its state, and its counts', () => {
    expect(
        taskPreviewLabel({
            archivedAt: '2026-11-20T12:00:00.000Z',
            messageCount: 4,
            title: 'Rate-limit webhooks',
            unreadCount: 1,
        })
    ).toBe('Open task Rate-limit webhooks, Archived, 4 messages, 1 new');
});
