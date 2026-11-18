import { describe, expect, test } from 'bun:test';
import {
    TriggerRateLimiter,
    triggerBurstLimit,
    triggerBurstWindowMs,
    triggerHourlyLimit,
} from './trigger-rate-limit.ts';

describe('trigger rate limit', () => {
    test('admits the burst allowance and then asks the caller to wait', () => {
        const limiter = new TriggerRateLimiter();
        const start = 1_000_000;

        for (let index = 0; index < triggerBurstLimit; index += 1) {
            expect(limiter.admit('trg_one', start + index)).toBeNull();
        }
        expect(limiter.admit('trg_one', start + triggerBurstLimit)).toEqual({
            retryAfterSeconds: 10,
        });
        expect(limiter.admit('trg_one', start + triggerBurstWindowMs + 1)).toBeNull();
    });

    test('holds a sustained caller to the hourly ceiling', () => {
        const limiter = new TriggerRateLimiter();
        const start = 1_000_000;
        // One fire per burst window keeps every burst check clear.
        for (let index = 0; index < triggerHourlyLimit; index += 1) {
            expect(limiter.admit('trg_one', start + index * triggerBurstWindowMs)).toBeNull();
        }
        const refusal = limiter.admit('trg_one', start + triggerHourlyLimit * triggerBurstWindowMs);

        expect(refusal?.retryAfterSeconds).toBeGreaterThan(0);
    });

    test('counts each trigger separately', () => {
        const limiter = new TriggerRateLimiter();
        for (let index = 0; index < triggerBurstLimit; index += 1) {
            limiter.admit('trg_one', 1000 + index);
        }

        expect(limiter.admit('trg_two', 1000)).toBeNull();
        expect(limiter.admit('trg_one', 1000)).not.toBeNull();
    });
});
