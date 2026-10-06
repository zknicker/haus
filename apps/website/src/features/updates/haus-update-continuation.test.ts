import { describe, expect, test } from 'bun:test';
import {
    hausUpdateContinuationStorageKey,
    hausUpdateContinuationTtlMs,
    readHausUpdateContinuation,
    rememberHausUpdateContinuation,
    takeHausUpdateContinuation,
} from './haus-update-continuation.ts';

const createdAt = Date.parse('2026-10-05T12:00:00.000Z');

describe('Haus update continuation', () => {
    test('is taken exactly once by the Server that remembered it', () => {
        const storage = memoryStorage();
        rememberHausUpdateContinuation(
            { computerIds: ['cmp_a', 'cmp_b'], serverId: 'srv_1' },
            storage,
            createdAt
        );

        expect(takeHausUpdateContinuation('srv_2', storage, createdAt + 1000)).toBeNull();
        expect(takeHausUpdateContinuation('srv_1', storage, createdAt + 1000)).toEqual({
            computerIds: ['cmp_a', 'cmp_b'],
            createdAt,
            serverId: 'srv_1',
        });
        expect(takeHausUpdateContinuation('srv_1', storage, createdAt + 2000)).toBeNull();
    });

    test('expires so a stale intent never starts work later', () => {
        const storage = memoryStorage();
        rememberHausUpdateContinuation(
            { computerIds: ['cmp_a'], serverId: 'srv_1' },
            storage,
            createdAt
        );

        const expiredAt = createdAt + hausUpdateContinuationTtlMs + 1;
        expect(readHausUpdateContinuation('srv_1', storage, expiredAt)).toBeNull();
        expect(takeHausUpdateContinuation('srv_1', storage, expiredAt)).toBeNull();
        expect(storage.getItem(hausUpdateContinuationStorageKey)).toBeNull();
    });

    test('ignores a malformed stored value', () => {
        const storage = memoryStorage();
        storage.setItem(hausUpdateContinuationStorageKey, '{"serverId":"srv_1"}');

        expect(takeHausUpdateContinuation('srv_1', storage, createdAt)).toBeNull();
    });
});

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => {
            values.delete(key);
        },
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
}
