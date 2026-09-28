import { expect, test } from 'bun:test';
import { maxDeliveryFailures, nextFailureHold } from './retry-policy.ts';

const now = 1_000_000;
const noJitter = () => 0;

function delayOf(hold: { retryAfter: Date | null }): number | null {
    return hold.retryAfter ? hold.retryAfter.getTime() - now : null;
}

test('ordinary failures count toward the bound and degrade at it', () => {
    const base = {
        failureKind: 'transport' as const,
        now,
        outputProduced: false,
        random: noJitter,
    };
    const first = nextFailureHold({ ...base, consecutiveFailures: 0, rateLimitStreak: 0 });
    expect(first.consecutiveFailures).toBe(1);
    expect(delayOf(first)).toBe(5000);
    const last = nextFailureHold({
        ...base,
        consecutiveFailures: maxDeliveryFailures - 1,
        rateLimitStreak: 0,
    });
    expect(last).toEqual({ consecutiveFailures: maxDeliveryFailures, retryAfter: null });
});

test('operator-action failures degrade immediately, even after output', () => {
    for (const failureKind of ['authentication', 'configuration', 'input'] as const) {
        expect(
            nextFailureHold({
                consecutiveFailures: 0,
                failureKind,
                now,
                outputProduced: true,
                rateLimitStreak: 0,
            })
        ).toEqual({ consecutiveFailures: maxDeliveryFailures, retryAfter: null });
    }
});

test('rate limits back off to a five-minute cap without counting toward the bound', () => {
    const delays = [1, 2, 3, 4, 5, 6, 12].map((rateLimitStreak) => {
        const hold = nextFailureHold({
            consecutiveFailures: 2,
            failureKind: 'rate-limit',
            now,
            outputProduced: false,
            random: noJitter,
            rateLimitStreak,
        });
        expect(hold.consecutiveFailures).toBe(2);
        return delayOf(hold);
    });
    expect(delays).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
});

test('jitter stretches a delay by at most ten percent and never past the cap', () => {
    const hold = (streak: number, random: () => number) =>
        delayOf(
            nextFailureHold({
                consecutiveFailures: 0,
                failureKind: 'rate-limit',
                now,
                outputProduced: false,
                random,
                rateLimitStreak: streak,
            })
        );
    expect(hold(1, () => 1)).toBe(11_000);
    expect(hold(1, () => 0.5)).toBe(10_500);
    expect(hold(7, () => 1)).toBe(300_000);
});

test('a failed turn that made progress backs off without counting a failure', () => {
    const hold = nextFailureHold({
        consecutiveFailures: 3,
        failureKind: 'unknown',
        now,
        outputProduced: true,
        random: noJitter,
        rateLimitStreak: 0,
    });
    expect(hold.consecutiveFailures).toBe(3);
    expect(delayOf(hold)).toBe(5000);
});
