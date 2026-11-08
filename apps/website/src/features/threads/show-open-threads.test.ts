import { expect, test } from 'bun:test';
import { readShowOpenThreads, showOpenThreadsStorageKey } from './show-open-threads.ts';

test('Open threads stays on until a reader turns it off', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(readShowOpenThreads(storage)).toBe(true);

    values.set(showOpenThreadsStorageKey, 'on');
    expect(readShowOpenThreads(storage)).toBe(true);

    values.set(showOpenThreadsStorageKey, 'off');
    expect(readShowOpenThreads(storage)).toBe(false);
});
