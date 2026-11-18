import {
    type AgentTurnSummary,
    type AgentWakePause,
    agentTurnFailureCodeSchema,
    agentTurnFailureKindSchema,
} from '@haus/api';
import { shouldRetryFailure } from './failure-policy.ts';
import { failureBackoffMs, rateLimitBackoffMs } from './retry-policy.ts';

/** The same failure this many times in a row pauses automatic wakes. */
export const sameFailurePauseThreshold = 3;
/** This many counted failures in a row pause automatic wakes, whatever they were. */
export const failurePauseThreshold = 5;

const hourMs = 60 * 60_000;
/** The wait before each probe: the pause opens at step 0, and each failed probe climbs one. */
export const probeDelaysMs = [hourMs, 4 * hourMs, 24 * hourMs] as const;

/** The `agent_delivery` columns the wake policy owns. */
export interface WakeState {
    consecutiveFailures: number;
    failureFingerprint: string | null;
    lastFailureAt: Date | null;
    lastFailureCode: string | null;
    lastFailureKind: string | null;
    pausedAt: Date | null;
    pauseStep: number | null;
    retryAfter: Date | null;
    sameFailureStreak: number;
}

export interface TurnFailure {
    failureCode?: AgentTurnSummary['failureCode'];
    failureFingerprint?: AgentTurnSummary['failureFingerprint'];
    failureKind?: AgentTurnSummary['failureKind'];
    /** Trailing rate-limit failures for this Agent, including this one. */
    rateLimitStreak: number;
}

/** A completed run, Start, Restart, reset, a runtime/model change, or a human lift. */
export const releasedWakeState: WakeState = {
    consecutiveFailures: 0,
    failureFingerprint: null,
    lastFailureAt: null,
    lastFailureCode: null,
    lastFailureKind: null,
    pausedAt: null,
    pauseStep: null,
    retryAfter: null,
    sameFailureStreak: 0,
};

/**
 * The wake state a failed turn leaves behind. Rate limits only back off. Every
 * other failure counts — output or not — and backs off briefly until the same
 * failure repeats, the streak grows too long, or the failure needs an operator;
 * then the pause opens with a one-hour probe. A failed probe climbs 1h → 4h → 24h.
 */
export function nextWakeState(
    state: WakeState,
    failure: TurnFailure,
    now: Date,
    random: () => number = Math.random
): WakeState {
    if (failure.failureKind === 'rate-limit') {
        const attempt = Math.max(1, failure.rateLimitStreak);
        return { ...state, retryAfter: after(now, rateLimitBackoffMs(attempt, random)) };
    }
    const fingerprint = failureFingerprintOf(failure);
    const counted: WakeState = {
        ...state,
        consecutiveFailures: state.consecutiveFailures + 1,
        failureFingerprint: fingerprint,
        lastFailureAt: now,
        lastFailureCode: failure.failureCode ?? null,
        lastFailureKind: failure.failureKind ?? 'unknown',
        sameFailureStreak:
            state.failureFingerprint === fingerprint ? state.sameFailureStreak + 1 : 1,
    };
    if (state.pausedAt) {
        const pauseStep = Math.min((state.pauseStep ?? 0) + 1, probeDelaysMs.length - 1);
        return { ...counted, pauseStep, retryAfter: after(now, probeDelaysMs[pauseStep] ?? 0) };
    }
    if (
        !shouldRetryFailure(failure.failureKind) ||
        counted.sameFailureStreak >= sameFailurePauseThreshold ||
        counted.consecutiveFailures >= failurePauseThreshold
    ) {
        return {
            ...counted,
            pausedAt: now,
            pauseStep: 0,
            retryAfter: after(now, probeDelaysMs[0]),
        };
    }
    return {
        ...counted,
        retryAfter: after(now, failureBackoffMs(counted.consecutiveFailures, random)),
    };
}

/** The public pause, or null when automatic wakes are not paused. */
export function toWakePause(
    row: Pick<
        WakeState,
        | 'consecutiveFailures'
        | 'lastFailureAt'
        | 'lastFailureCode'
        | 'lastFailureKind'
        | 'pausedAt'
        | 'retryAfter'
    > & { activeRunId: string | null }
): AgentWakePause | null {
    if (!row.pausedAt) {
        return null;
    }
    if (!(row.lastFailureAt && row.lastFailureKind) || row.consecutiveFailures < 1) {
        throw new Error('A paused Agent must record the failure that paused it.');
    }
    return {
        failureCount: row.consecutiveFailures,
        lastFailure: {
            at: row.lastFailureAt.toISOString(),
            code: row.lastFailureCode
                ? agentTurnFailureCodeSchema.parse(row.lastFailureCode)
                : null,
            kind: agentTurnFailureKindSchema.parse(row.lastFailureKind),
        },
        // The probe is the active run: no further probe is scheduled while it runs.
        nextProbeAt: row.activeRunId ? null : (row.retryAfter?.toISOString() ?? null),
        pausedAt: row.pausedAt.toISOString(),
    };
}

/** Computer's hash of the raw error when present; otherwise the stable kind and code. */
function failureFingerprintOf(failure: TurnFailure): string {
    return (
        failure.failureFingerprint ??
        `${failure.failureKind ?? 'unknown'}/${failure.failureCode ?? 'none'}`
    );
}

function after(now: Date, ms: number): Date {
    return new Date(now.getTime() + ms);
}
