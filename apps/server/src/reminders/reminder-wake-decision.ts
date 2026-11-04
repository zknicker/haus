import { createHash } from 'node:crypto';
import type { ReminderFireOutcome } from '../postgres/schema/reminders.ts';

export interface ReminderWakeState {
    consecutiveFailures: number;
    failAfter: number | null;
    lastWakeOutputHash: string | null;
    wakeOnChange: boolean;
}

export interface ReminderWakeDecision {
    /** The failure streak this run ends on, when it recovers; for the "recovered" notice. */
    failureStreak: number | null;
    nextState: Pick<ReminderWakeState, 'consecutiveFailures' | 'lastWakeOutputHash'>;
    outcome: ReminderFireOutcome;
    wake: boolean;
}

/** `--wake-on-change` compares on this, so a volatile trailing timestamp line still dedupes. */
export function normalizeReminderScriptOutput(output: string): string {
    return output
        .split(/\r\n|\r|\n/u)
        .map((line) => line.replace(/[ \t]+$/u, ''))
        .join('\n')
        .trim();
}

export function hashReminderScriptOutput(output: string): string {
    return createHash('sha256').update(normalizeReminderScriptOutput(output)).digest('hex');
}

/**
 * Decides whether one script run wakes its Agent, given the reminder's wake
 * rules and its state across prior runs. Pure and stateless beyond its inputs,
 * so the caller owns persisting `nextState` back onto the reminder.
 *
 * Without `--fail-after`, every failure wakes (today's behavior). With it, a
 * failure stays quiet until the Nth consecutive one, which wakes once; further
 * consecutive failures stay quiet until a success wakes once more with a
 * "recovered" notice. `--wake-on-change` applies only to a successful run with
 * output: it wakes only when that output's hash differs from the last run that
 * woke the Agent.
 */
export function decideReminderWake(
    state: ReminderWakeState,
    script: { exitCode: number; output: string; timedOut: boolean }
): ReminderWakeDecision {
    const isFailure = script.timedOut || script.exitCode !== 0;

    if (isFailure) {
        const consecutiveFailures = state.consecutiveFailures + 1;
        const wake = state.failAfter === null || consecutiveFailures === state.failAfter;
        return {
            failureStreak: null,
            nextState: { consecutiveFailures, lastWakeOutputHash: state.lastWakeOutputHash },
            outcome: wake ? 'woke' : 'failed',
            wake,
        };
    }

    const recovering = state.failAfter !== null && state.consecutiveFailures >= state.failAfter;
    if (recovering) {
        return {
            failureStreak: state.consecutiveFailures,
            nextState: { consecutiveFailures: 0, lastWakeOutputHash: state.lastWakeOutputHash },
            outcome: 'recovered',
            wake: true,
        };
    }

    const hadOutput = normalizeReminderScriptOutput(script.output).length > 0;
    if (!hadOutput) {
        return {
            failureStreak: null,
            nextState: { consecutiveFailures: 0, lastWakeOutputHash: state.lastWakeOutputHash },
            outcome: 'quiet',
            wake: false,
        };
    }

    if (state.wakeOnChange) {
        const hash = hashReminderScriptOutput(script.output);
        if (hash === state.lastWakeOutputHash) {
            return {
                failureStreak: null,
                nextState: { consecutiveFailures: 0, lastWakeOutputHash: state.lastWakeOutputHash },
                outcome: 'unchanged',
                wake: false,
            };
        }
        return {
            failureStreak: null,
            nextState: { consecutiveFailures: 0, lastWakeOutputHash: hash },
            outcome: 'woke',
            wake: true,
        };
    }

    return {
        failureStreak: null,
        nextState: { consecutiveFailures: 0, lastWakeOutputHash: state.lastWakeOutputHash },
        outcome: 'woke',
        wake: true,
    };
}
