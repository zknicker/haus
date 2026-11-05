import type { CloudLaunchRejection, CloudPendingSend } from './launch-journal.ts';
import { CloudAgentLaunchRejectedError } from './provider.ts';

/**
 * How long a follow-up keeps retrying, after its first send attempt fails
 * retryably, before `send-queue.ts` tries the auto-interrupt fallback. The
 * clock starts at the first attempt, not at queueing: waiting behind a
 * predecessor Haus is actively tracking is legitimate for hours and is never
 * governed by this constant (see `previousReady`). Once no tracked predecessor
 * is blocking, a hosted session normally accepts a send right away even while
 * it is otherwise busy (TECH-7's design refinement); a send that still keeps
 * failing this long is worth clearing the session's current work for, rather
 * than waiting longer in silence.
 */
export const followUpInterruptGraceMs = 2 * 60_000;
const firstBackoffMs = 5000;
const maxBackoffMs = 60_000;

/**
 * Codes a Run settles with when its prompt never reached the provider, or
 * rides a still-queued, still-retrying Run's `errorCode` when it hasn't
 * settled at all. They reach the delegating Agent's inbox attention with the
 * summary either way.
 */
export const cloudAgentDeliveryFailure = {
    /** The provider definitely refused the launch. */
    launchRejected: 'provider-launch-rejected',
    /** The provider definitely refused the follow-up. */
    followUpRejected: 'followup-delivery-rejected',
    /**
     * Haus auto-interrupted the session to clear whatever held it busy, and
     * the follow-up still didn't deliver (the interrupt itself failed, or a
     * send attempt right after it failed too). Rides a still-`queued`,
     * still-retrying observation's `errorCode`; it never fails the Run.
     */
    followUpAutoInterruptFailed: 'followup-auto-interrupt-failed',
    /** Server recorded the Run but this Computer never stored its prompt. */
    launchRecordMissing: 'launch-record-missing',
} as const;

/** How long a Run may lack any Computer record before it settles as never sent. */
export const launchRecordGraceMs = 2 * 60_000;

export type SendOutcome =
    | { kind: 'reject'; rejection: CloudLaunchRejection }
    | { kind: 'retry'; delivery: NonNullable<CloudPendingSend['delivery']> };

/** What one failed follow-up send means for its pending prompt. */
export function sendFailureOutcome(
    pending: CloudPendingSend,
    cause: unknown,
    now: number
): SendOutcome {
    if (cause instanceof CloudAgentLaunchRejectedError) {
        return {
            kind: 'reject',
            rejection: {
                errorCode: cloudAgentDeliveryFailure.followUpRejected,
                summary: bounded(`The provider rejected the follow-up: ${reasonOf(cause)}`),
            },
        };
    }
    const attempts = (pending.delivery?.attempts ?? 0) + 1;
    const firstAttemptAt = pending.delivery?.firstAttemptAt ?? new Date(now).toISOString();
    const lastError = bounded(errorMessage(cause), 500);
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    return {
        kind: 'retry',
        delivery: {
            attempts,
            firstAttemptAt,
            interruptedAt: pending.delivery?.interruptedAt ?? null,
            lastError,
            nextAttemptAt: new Date(now + backoff).toISOString(),
        },
    };
}

/** A pending prompt waits out its backoff before the next attempt. */
export function deliveryDue(pending: CloudPendingSend, now: number): boolean {
    return !pending.delivery || Date.parse(pending.delivery.nextAttemptAt) <= now;
}

export function launchRejection(cause: unknown): CloudLaunchRejection {
    return {
        errorCode: cloudAgentDeliveryFailure.launchRejected,
        summary: bounded(`The provider rejected the launch: ${reasonOf(cause)}`),
    };
}

export const launchRecordMissing: CloudLaunchRejection = {
    errorCode: cloudAgentDeliveryFailure.launchRecordMissing,
    summary:
        'This Computer has no record of the prompt for this Run, so it never reached the provider. Send it again if it is still needed.',
};

function reasonOf(cause: unknown): string {
    const message = errorMessage(cause);
    return cause instanceof CloudAgentLaunchRejectedError && cause.providerCode
        ? `${message} (${cause.providerCode})`
        : message;
}

function errorMessage(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : String(cause);
    return message.trim() || 'unknown error';
}

/** Run summaries are bounded at 2,000 characters on the wire. */
function bounded(text: string, limit = 1000): string {
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
