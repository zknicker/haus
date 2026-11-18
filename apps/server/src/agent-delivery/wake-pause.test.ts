import { describe, expect, test } from 'bun:test';
import { isBackedOff } from './retry-policy.ts';
import {
    nextWakeState,
    probeDelaysMs,
    releasedWakeState,
    type TurnFailure,
    toWakePause,
    type WakeState,
} from './wake-pause.ts';

const hourMs = 60 * 60_000;
const start = new Date('2026-10-06T12:00:00Z');
const noJitter = () => 0;
const compaction: TurnFailure = {
    failureCode: 'compaction-failed',
    failureFingerprint: '0123456789abcdef',
    failureKind: 'unknown',
    rateLimitStreak: 0,
};

function fail(state: WakeState, failure: TurnFailure, at: Date): WakeState {
    return nextWakeState(state, failure, at, noJitter);
}

function delayOf(state: WakeState, at: Date): number | null {
    return state.retryAfter ? state.retryAfter.getTime() - at.getTime() : null;
}

function plus(at: Date, ms: number): Date {
    return new Date(at.getTime() + ms);
}

describe('wake pause', () => {
    test('regression: the same failure pauses after three, then probes 1h → 4h → 24h → 24h', () => {
        let state = releasedWakeState;
        let at = start;
        state = fail(state, compaction, at);
        expect(state.pausedAt).toBeNull();
        expect(delayOf(state, at)).toBe(5000);
        at = plus(at, 5000);
        state = fail(state, compaction, at);
        expect(state.pausedAt).toBeNull();
        expect(delayOf(state, at)).toBe(10_000);
        at = plus(at, 10_000);
        state = fail(state, compaction, at);
        expect(state).toMatchObject({
            consecutiveFailures: 3,
            lastFailureCode: 'compaction-failed',
            lastFailureKind: 'unknown',
            pausedAt: at,
            pauseStep: 0,
            sameFailureStreak: 3,
        });
        expect(delayOf(state, at)).toBe(hourMs);
        // The sweep and dispatch hold automatic work for the whole hour.
        expect(isBackedOff(state, plus(at, hourMs - 1).getTime())).toBe(true);
        expect(isBackedOff(state, plus(at, hourMs).getTime())).toBe(false);

        const probes: (number | null)[] = [];
        for (let probe = 0; probe < 3; probe += 1) {
            at = state.retryAfter ?? at;
            state = fail(state, compaction, at);
            probes.push(delayOf(state, at));
        }
        expect(probes).toEqual([4 * hourMs, 24 * hourMs, 24 * hourMs]);
        expect(state.pauseStep).toBe(2);
        expect(state.pausedAt).toEqual(plus(start, 15_000));
        expect(state.consecutiveFailures).toBe(6);
    });

    test('a changing failure pauses at five, and output-producing failures count', () => {
        let state = releasedWakeState;
        for (let index = 0; index < 4; index += 1) {
            state = fail(
                state,
                {
                    failureKind: 'transport',
                    failureFingerprint: `000000000000000${index}`,
                    rateLimitStreak: 0,
                },
                start
            );
            expect(state.sameFailureStreak).toBe(1);
            expect(state.pausedAt).toBeNull();
        }
        state = fail(state, { failureKind: 'timeout', rateLimitStreak: 0 }, start);
        expect(state.consecutiveFailures).toBe(5);
        expect(state.pausedAt).toEqual(start);
        expect(delayOf(state, start)).toBe(probeDelaysMs[0]);
    });

    test('without a Computer fingerprint, kind and code identify the failure', () => {
        let state = releasedWakeState;
        const failure: TurnFailure = { failureKind: 'unknown', rateLimitStreak: 0 };
        state = fail(state, failure, start);
        expect(state.failureFingerprint).toBe('unknown/none');
        state = fail(state, { ...failure, failureCode: 'turn-stalled' }, start);
        expect(state.failureFingerprint).toBe('unknown/turn-stalled');
        expect(state.sameFailureStreak).toBe(1);
    });

    test('operator-action failures pause at once', () => {
        for (const failureKind of ['authentication', 'configuration', 'input'] as const) {
            const state = fail(releasedWakeState, { failureKind, rateLimitStreak: 0 }, start);
            expect(state.consecutiveFailures).toBe(1);
            expect(state.pausedAt).toEqual(start);
            expect(delayOf(state, start)).toBe(hourMs);
        }
    });

    test('rate limits only back off and never touch the failure streak', () => {
        const counted = fail(releasedWakeState, compaction, start);
        const limited = fail(
            counted,
            { failureCode: 'rate-limited', failureKind: 'rate-limit', rateLimitStreak: 3 },
            start
        );
        expect(limited.consecutiveFailures).toBe(1);
        expect(limited.sameFailureStreak).toBe(1);
        expect(limited.failureFingerprint).toBe(counted.failureFingerprint);
        expect(limited.lastFailureCode).toBe('compaction-failed');
        expect(delayOf(limited, start)).toBe(40_000);
    });

    test('projects the pause, with no next probe while the probe run is active', () => {
        let state = releasedWakeState;
        for (let index = 0; index < 3; index += 1) {
            state = fail(state, compaction, start);
        }
        expect(toWakePause({ ...releasedWakeState, activeRunId: null })).toBeNull();
        expect(toWakePause({ ...state, activeRunId: null })).toEqual({
            failureCount: 3,
            lastFailure: { at: start.toISOString(), code: 'compaction-failed', kind: 'unknown' },
            nextProbeAt: plus(start, hourMs).toISOString(),
            pausedAt: start.toISOString(),
        });
        expect(toWakePause({ ...state, activeRunId: 'run_probe' })?.nextProbeAt).toBeNull();
    });
});
