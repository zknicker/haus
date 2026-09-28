import type { AgentTurnSummary } from '@haus/api';
import { shouldRetryFailure } from './failure-policy.ts';
import type { AgentDeliveryRow } from './store.ts';

export const maxDeliveryFailures = 5;

interface BackoffSchedule {
    baseMs: number;
    capMs: number;
}

const failureBackoff: BackoffSchedule = { baseMs: 5000, capMs: 60_000 };
// A usage limit can last hours: back off longer and never degrade on it.
const rateLimitBackoff: BackoffSchedule = { baseMs: 10_000, capMs: 5 * 60_000 };
const jitterRatio = 0.1;

export interface DeliveryFailureHold {
    consecutiveFailures: number;
    retryAfter: Date | null;
}

export interface DeliveryFailureInput {
    consecutiveFailures: number;
    failureKind: AgentTurnSummary['failureKind'];
    now?: number;
    outputProduced: boolean;
    random?: () => number;
    /** Trailing rate-limit failures for this Agent, including this one. */
    rateLimitStreak: number;
}

export function isBackedOff(state: AgentDeliveryRow): boolean {
    if (state.consecutiveFailures >= maxDeliveryFailures) {
        return true;
    }
    return state.retryAfter !== null && state.retryAfter.getTime() > Date.now();
}

/**
 * The hold a failed turn leaves behind. Operator-action failures degrade at
 * once. Rate limits and turns that made progress back off without counting
 * toward the degrade bound; other failures count and degrade at the bound.
 */
export function nextFailureHold(input: DeliveryFailureInput): DeliveryFailureHold {
    const now = input.now ?? Date.now();
    const random = input.random ?? Math.random;
    if (!shouldRetryFailure(input.failureKind)) {
        return { consecutiveFailures: maxDeliveryFailures, retryAfter: null };
    }
    if (input.failureKind === 'rate-limit') {
        const attempt = Math.max(1, input.rateLimitStreak);
        return {
            consecutiveFailures: input.consecutiveFailures,
            retryAfter: new Date(now + backoffMs(rateLimitBackoff, attempt, random)),
        };
    }
    if (input.outputProduced) {
        return {
            consecutiveFailures: input.consecutiveFailures,
            retryAfter: new Date(now + backoffMs(failureBackoff, 1, random)),
        };
    }
    const failures = input.consecutiveFailures + 1;
    return {
        consecutiveFailures: failures,
        retryAfter:
            failures < maxDeliveryFailures
                ? new Date(now + backoffMs(failureBackoff, failures, random))
                : null,
    };
}

function backoffMs(schedule: BackoffSchedule, attempt: number, random: () => number) {
    const capped = Math.min(schedule.capMs, schedule.baseMs * 2 ** Math.max(0, attempt - 1));
    const unit = Math.max(0, Math.min(1, random()));
    return Math.min(schedule.capMs, capped + Math.floor(capped * jitterRatio * unit));
}
