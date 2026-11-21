import { expect, test } from 'bun:test';
import type { ChatUnreadPreview } from '@haus/api';
import { countFollowedTaskPreviews, countUnreadChats } from './use-unread-count.ts';

test('the dock badge counts each Chat with unread messages once', () => {
    expect(countUnreadChats([{ unreadCount: 0 }, { unreadCount: 3 }, { unreadCount: 1 }])).toBe(2);
});

test('the dock badge counts followed Tasks, not plain Chat previews', () => {
    const previews = [
        { chatId: 'cht_lit', messages: [], task: null },
        {
            chatId: 'cht_task',
            messages: [],
            task: {
                key: 'SEC-1',
                projectId: 'cht_lit',
                state: 'open',
                taskId: 'tsk_1',
                title: 'T',
            },
        },
    ] as unknown as ChatUnreadPreview[];
    expect(countFollowedTaskPreviews({ previews })).toBe(1);
});
