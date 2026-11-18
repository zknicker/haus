import { expect, test } from 'bun:test';
import { settleEvalCleanup } from './cleanup-chats.mjs';

test('completed cleanup does not become a deferred cleanup after its deadline', async () => {
    const outcomes = [];
    await settleEvalCleanup(Promise.resolve(), 10).then((outcome) => outcomes.push(outcome));
    await Bun.sleep(20);
    expect(outcomes).toEqual([true]);
});

test('a stalled cleanup defers at the deadline', async () => {
    expect(await settleEvalCleanup(new Promise(() => {}), 10)).toBe(false);
});

test('cleanup errors retain their original failure', async () => {
    await expect(settleEvalCleanup(Promise.reject(new Error('delete failed')), 10)).rejects.toThrow(
        'delete failed'
    );
});
