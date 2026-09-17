import { expect, test } from 'bun:test';
import { historyFetchFailed } from './use-chat-message-navigation.ts';

test('navigation treats resolved infinite-query error results as failed pages', () => {
    expect(historyFetchFailed({ isError: true })).toBe(true);
    expect(historyFetchFailed({ isError: false })).toBe(false);
    expect(historyFetchFailed(undefined)).toBe(false);
});
