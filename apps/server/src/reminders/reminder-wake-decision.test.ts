import { describe, expect, test } from 'bun:test';
import {
    decideReminderWake,
    hashReminderScriptOutput,
    normalizeReminderScriptOutput,
    type ReminderWakeState,
} from './reminder-wake-decision.ts';

const baseState: ReminderWakeState = {
    consecutiveFailures: 0,
    failAfter: null,
    lastWakeOutputHash: null,
    wakeOnChange: false,
};

describe("decideReminderWake without either flag (today's behavior)", () => {
    test('a success with no output stays quiet', () => {
        const decision = decideReminderWake(baseState, {
            exitCode: 0,
            output: '',
            timedOut: false,
        });
        expect(decision).toMatchObject({ outcome: 'quiet', wake: false });
    });

    test('a success with output always wakes', () => {
        const decision = decideReminderWake(baseState, {
            exitCode: 0,
            output: 'disk at 91%',
            timedOut: false,
        });
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
    });

    test('every failure wakes, with no streak tracked for the decision', () => {
        const first = decideReminderWake(baseState, { exitCode: 1, output: '', timedOut: false });
        expect(first).toMatchObject({ outcome: 'woke', wake: true });
        const second = decideReminderWake(
            { ...baseState, consecutiveFailures: first.nextState.consecutiveFailures },
            { exitCode: 1, output: '', timedOut: false }
        );
        expect(second).toMatchObject({ outcome: 'woke', wake: true });
    });

    test('a timeout wakes like any other failure', () => {
        const decision = decideReminderWake(baseState, { exitCode: 0, output: '', timedOut: true });
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
    });
});

describe('decideReminderWake with --wake-on-change', () => {
    const state: ReminderWakeState = { ...baseState, wakeOnChange: true };

    test('the first waking output wakes and is remembered', () => {
        const decision = decideReminderWake(state, {
            exitCode: 0,
            output: 'disk at 91%',
            timedOut: false,
        });
        expect(decision.outcome).toBe('woke');
        expect(decision.wake).toBe(true);
        expect(decision.nextState.lastWakeOutputHash).toBe(hashReminderScriptOutput('disk at 91%'));
    });

    test('identical output next time is a quiet "unchanged" run', () => {
        const remembered = hashReminderScriptOutput('disk at 91%');
        const decision = decideReminderWake(
            { ...state, lastWakeOutputHash: remembered },
            { exitCode: 0, output: 'disk at 91%', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'unchanged', wake: false });
        expect(decision.nextState.lastWakeOutputHash).toBe(remembered);
    });

    test('trailing whitespace does not count as a change', () => {
        const remembered = hashReminderScriptOutput('disk at 91%\n');
        const decision = decideReminderWake(
            { ...state, lastWakeOutputHash: remembered },
            { exitCode: 0, output: 'disk at 91%   ', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'unchanged', wake: false });
    });

    test('different output wakes again and updates the remembered hash', () => {
        const remembered = hashReminderScriptOutput('disk at 91%');
        const decision = decideReminderWake(
            { ...state, lastWakeOutputHash: remembered },
            { exitCode: 0, output: 'disk at 97%', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
        expect(decision.nextState.lastWakeOutputHash).toBe(hashReminderScriptOutput('disk at 97%'));
    });

    test('a quiet success (no output) never consults the hash', () => {
        const remembered = hashReminderScriptOutput('disk at 91%');
        const decision = decideReminderWake(
            { ...state, lastWakeOutputHash: remembered },
            { exitCode: 0, output: '', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'quiet', wake: false });
        expect(decision.nextState.lastWakeOutputHash).toBe(remembered);
    });

    test('--wake-on-change never changes failure handling', () => {
        const decision = decideReminderWake(state, { exitCode: 1, output: '', timedOut: false });
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
    });
});

describe('decideReminderWake with --fail-after', () => {
    const state: ReminderWakeState = { ...baseState, failAfter: 3 };

    test('failures before the threshold stay quiet and the streak climbs', () => {
        let current = state;
        for (const expectedStreak of [1, 2]) {
            const decision = decideReminderWake(current, {
                exitCode: 1,
                output: '',
                timedOut: false,
            });
            expect(decision).toMatchObject({ outcome: 'failed', wake: false });
            expect(decision.nextState.consecutiveFailures).toBe(expectedStreak);
            current = { ...current, consecutiveFailures: decision.nextState.consecutiveFailures };
        }
    });

    test('the Nth consecutive failure wakes once', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 2 },
            { exitCode: 1, output: 'disk check failed', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
        expect(decision.nextState.consecutiveFailures).toBe(3);
    });

    test('further consecutive failures after the wake stay quiet', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 3 },
            { exitCode: 1, output: '', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'failed', wake: false });
        expect(decision.nextState.consecutiveFailures).toBe(4);
    });

    test('the first success after a streak that woke sends one "recovered" notice', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 5 },
            { exitCode: 0, output: '', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'recovered', wake: true, failureStreak: 5 });
        expect(decision.nextState.consecutiveFailures).toBe(0);
    });

    test('recovery wakes even when the success has no output to report', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 4 },
            { exitCode: 0, output: '   \n  ', timedOut: false }
        );
        expect(decision.outcome).toBe('recovered');
        expect(decision.wake).toBe(true);
    });

    test('a success that resets a streak which never reached the threshold is silent', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 1 },
            { exitCode: 0, output: '', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'quiet', wake: false, failureStreak: null });
        expect(decision.nextState.consecutiveFailures).toBe(0);
    });
});

describe('decideReminderWake with both flags together', () => {
    const state: ReminderWakeState = { ...baseState, failAfter: 2, wakeOnChange: true };

    test('a failure streak reaching threshold wakes regardless of wake-on-change', () => {
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 1 },
            { exitCode: 1, output: 'same error', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'woke', wake: true });
    });

    test('recovery always wakes even if its (empty) output matches the last remembered hash', () => {
        const remembered = hashReminderScriptOutput('');
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 2, lastWakeOutputHash: remembered },
            { exitCode: 0, output: '', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'recovered', wake: true });
    });

    test('after recovery, a later success still dedupes against the pre-streak hash', () => {
        const remembered = hashReminderScriptOutput('all clear');
        const decision = decideReminderWake(
            { ...state, consecutiveFailures: 0, lastWakeOutputHash: remembered },
            { exitCode: 0, output: 'all clear', timedOut: false }
        );
        expect(decision).toMatchObject({ outcome: 'unchanged', wake: false });
    });
});

test('normalizeReminderScriptOutput strips trailing whitespace per line and overall', () => {
    expect(normalizeReminderScriptOutput('a  \nb\t\n  \n')).toBe('a\nb');
});
