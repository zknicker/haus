import { expect, test } from 'bun:test';
import type { ChatUnreadPreview } from '@haus/api';
import { findUnreadPreview } from './use-unread-previews.ts';

const preview = (chatId: string) =>
    ({ chatId, earlierUnreadCount: 0, messages: [] }) as unknown as ChatUnreadPreview;

test('a row selects its own preview by Chat id', () => {
    const thread = preview('cht_thread');
    expect(findUnreadPreview({ previews: [preview('cht_a'), thread] }, 'cht_thread')).toBe(thread);
});

test('a settled list that does not name the row yet answers null, not undefined', () => {
    // Undefined is reserved for an unsettled read, which a row leaves blank.
    expect(findUnreadPreview({ previews: [preview('cht_a')] }, 'cht_b')).toBeNull();
});
