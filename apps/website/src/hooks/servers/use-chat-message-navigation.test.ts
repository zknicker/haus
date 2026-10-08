import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    type ChatMessageJumpTarget,
    historyFetchFailed,
    revealLoadedMessage,
    useChatMessageNavigation,
} from './use-chat-message-navigation.ts';

test('navigation treats resolved infinite-query error results as failed pages', () => {
    expect(historyFetchFailed({ isError: true })).toBe(true);
    expect(historyFetchFailed({ isError: false })).toBe(false);
    expect(historyFetchFailed(undefined)).toBe(false);
});

// A Thread page shows its root message too: a document-wide lookup flashed that copy, so
// View in chat left the chat's own row unmarked.
test('a reveal flashes the message in its own transcript, never another copy in the window', () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    const saved = { CSS: scope.CSS, window: scope.window };
    scope.CSS = { escape: (value: string) => value };
    scope.window = { setTimeout: () => 0 };
    try {
        const flashed: string[] = [];
        const row = {
            classList: { add: (name: string) => flashed.push(name), remove: () => undefined },
            closest: () => null,
            scrollIntoView: () => undefined,
        };
        const transcript = {
            current: {
                querySelector: (selector: string) =>
                    selector === '[data-message-id="m1"]' ? row : null,
            } as unknown as ParentNode,
        };
        expect(revealLoadedMessage(transcript, { id: 'm1', sequence: 1 })).toBe(true);
        expect(flashed).toEqual(['chat-thread-flash']);
        expect(revealLoadedMessage({ current: null }, { id: 'm1', sequence: 1 })).toBe(false);
    } finally {
        scope.CSS = saved.CSS;
        scope.window = saved.window;
    }
});

// A bare scrollIntoView left the scroller following the end, so the resize from
// the older page a far-off reveal just loaded pinned the transcript back to the bottom.
test('a reveal jumps through the transcript scroller, so it stops following the end', () => {
    const scope = globalThis as unknown as Record<string, unknown>;
    const saved = { CSS: scope.CSS, window: scope.window };
    scope.CSS = { escape: (value: string) => value };
    scope.window = { setTimeout: () => 0 };
    try {
        const row = {
            classList: { add: () => undefined, remove: () => undefined },
            closest: () => ({ dataset: { messageId: 'turn:m1' } }),
            scrollIntoView: () => undefined,
        };
        const transcript = {
            current: {
                querySelector: (selector: string) =>
                    selector === '[data-message-id="m1"]' ? row : null,
            } as unknown as ParentNode,
        };
        const jumps: string[] = [];
        const scroller = {
            current: (id: string) => {
                jumps.push(id);
                return true;
            },
        };
        let reveal: (target: ChatMessageJumpTarget) => void = () => undefined;
        function Probe() {
            reveal = useChatMessageNavigation({
                chatId: 'chat_one',
                fetchOlderHistory: () => Promise.resolve(),
                hasOlderHistory: false,
                messages: [{ id: 'm1', sequence: 1 }],
                scroller,
                transcript,
            }).revealMessage;
            return null;
        }
        renderToStaticMarkup(createElement(Probe));

        reveal({ id: 'm1', sequence: 1 });

        expect(jumps).toEqual(['turn:m1']);
    } finally {
        scope.CSS = saved.CSS;
        scope.window = saved.window;
    }
});
