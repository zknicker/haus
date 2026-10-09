import { expect, test } from 'bun:test';
import type { ChatMessage } from '@haus/api';
import { history, message } from '../../test-support/transcript-render-harness.tsx';
import { shareMessagePages } from './message-page-sharing.ts';

function pages(messages: ChatMessage[]) {
    return {
        pageParams: [undefined],
        pages: [{ messages, nextAfterSequence: null, nextBeforeSequence: null, threads: [] }],
    };
}

test('a shifted newest page keeps every unchanged message object by id', () => {
    const before = pages(history('cht_a', 4));
    const after = shareMessagePages(
        before,
        pages([...history('cht_a', 4).slice(1), message('cht_a', 5)])
    ) as typeof before;

    const previous = before.pages[0]?.messages ?? [];
    const next = after.pages[0]?.messages ?? [];
    expect(next.slice(0, 3)).toEqual(previous.slice(1));
    for (const [index, kept] of next.slice(0, 3).entries()) {
        expect(kept).toBe(previous[index + 1] as ChatMessage);
    }
    expect(next[3]?.id).toBe('msg_cht_a_5');
});

test('a changed message gets a new object; an identical refetch returns the previous data', () => {
    const before = pages(history('cht_a', 3));
    const edited = history('cht_a', 3).map((item) =>
        item.sequence === 2 ? { ...item, content: 'edited' } : item
    );
    const after = shareMessagePages(before, pages(edited)) as typeof before;
    const previous = before.pages[0]?.messages ?? [];
    const next = after.pages[0]?.messages ?? [];

    expect(next[0]).toBe(previous[0] as ChatMessage);
    expect(next[1]).not.toBe(previous[1] as ChatMessage);
    expect(next[1]?.content).toBe('edited');
    expect(next[2]).toBe(previous[2] as ChatMessage);
    expect(shareMessagePages(before, pages(history('cht_a', 3)))).toBe(before);
});
