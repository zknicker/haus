import { expect, test } from 'bun:test';
import { failureBackoffMs, isBackedOff, rateLimitBackoffMs } from './retry-policy.ts';

const noJitter = () => 0;

test('counted failures back off from five seconds to a one-minute cap', () => {
    expect([1, 2, 3, 4, 5, 9].map((attempt) => failureBackoffMs(attempt, noJitter))).toEqual([
        5000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
});

test('rate limits back off to a five-minute cap', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((attempt) => rateLimitBackoffMs(attempt, noJitter))).toEqual([
        10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000,
    ]);
});

test('jitter stretches a delay by at most ten percent and never past the cap', () => {
    expect(rateLimitBackoffMs(1, () => 1)).toBe(11_000);
    expect(rateLimitBackoffMs(1, () => 0.5)).toBe(10_500);
    expect(rateLimitBackoffMs(7, () => 1)).toBe(300_000);
});

test('dispatch is held only while retry_after is in the future', () => {
    const now = 1_000_000;
    expect(isBackedOff({ retryAfter: null }, now)).toBe(false);
    expect(isBackedOff({ retryAfter: new Date(now) }, now)).toBe(false);
    expect(isBackedOff({ retryAfter: new Date(now + 1) }, now)).toBe(true);
});
