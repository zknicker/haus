import { expect, test } from 'bun:test';
import { historyFetchFailed, revealLoadedMessage } from './use-chat-message-navigation.ts';

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
