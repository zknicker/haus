import { afterEach, expect, test } from 'bun:test';
import {
    getLaterTurns,
    questionsLaterStorageKey,
    readLaterTurns,
    reloadQuestionsLater,
    setQuestionsLater,
} from './use-questions-later.ts';

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        values,
    };
}

const blockedStorage = {
    getItem: () => {
        throw new Error('blocked');
    },
    setItem: () => {
        throw new Error('blocked');
    },
};

afterEach(() => {
    for (const turnId of getLaterTurns()) {
        setQuestionsLater(turnId, false, null);
    }
});

test('Later hides one asking turn on this device and persists it; bringing it back clears it', () => {
    const storage = memoryStorage();
    setQuestionsLater('wkt_one', true, storage);

    expect(getLaterTurns()).toEqual(['wkt_one']);
    expect(readLaterTurns(storage)).toEqual(['wkt_one']);

    setQuestionsLater('wkt_one', false, storage);
    expect(getLaterTurns()).toEqual([]);
    expect(storage.values.get(questionsLaterStorageKey)).toBe('[]');
});

test('Later applies even when storage is blocked, and unreadable storage reads as nothing hidden', () => {
    setQuestionsLater('wkt_one', true, blockedStorage);

    expect(getLaterTurns()).toEqual(['wkt_one']);
    expect(readLaterTurns(blockedStorage)).toEqual([]);
    expect(readLaterTurns(memoryStorage({ [questionsLaterStorageKey]: '{oops' }))).toEqual([]);
});

test('another window’s Later arrives on reload, and only the newest fifty turns are kept', () => {
    reloadQuestionsLater(memoryStorage({ [questionsLaterStorageKey]: '["wkt_far", 4]' }));
    expect(getLaterTurns()).toEqual(['wkt_far']);

    const storage = memoryStorage();
    for (const index of Array.from({ length: 51 }, (_, value) => value)) {
        setQuestionsLater(`wkt_${index}`, true, storage);
    }
    expect(getLaterTurns()).toHaveLength(50);
    expect(getLaterTurns()).not.toContain('wkt_far');
    expect(getLaterTurns().at(-1)).toBe('wkt_50');
});
