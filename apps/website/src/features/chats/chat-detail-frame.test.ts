import { expect, test } from 'bun:test';
import { chatTimelineHasContent } from './chat-detail-frame.tsx';

test('a transient composition keeps an otherwise empty chat timeline visible', () => {
    expect(
        chatTimelineHasContent({
            activeReplyCount: 0,
            hasTransientTimelineContent: true,
            rowCount: 0,
        })
    ).toBe(true);
});
