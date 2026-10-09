import type { CloudLaunchRejection, CloudPendingSend } from './launch-journal.ts';
import { CloudAgentLaunchRejectedError } from './provider.ts';

/**
 * How long a follow-up keeps retrying after its first send attempt fails
 * retryably. The clock starts at the first attempt, not at queueing: waiting
 * behind a predecessor that is still running is legitimate for hours. Once
 * predecessors have settled, a busy agent frees within seconds, so busy for
 * this long means a Run Haus does not track holds the agent; a provider outage
 * this long is worth the delegating Agent's judgment rather than silence.
 */
export const followUpDeliveryDeadlineMs = 30 * 60_000;
const firstBackoffMs = 5000;
const maxBackoffMs = 60_000;

/**
 * Codes a Run settles with when its prompt never reached the provider. They
 * ride the Run's `errorCode`, and the delegating Agent reads them in its inbox
 * attention with the summary.
 */
export const cloudAgentDeliveryFailure = {
    /** The provider definitely refused the launch. */
    launchRejected: 'provider-launch-rejected',
    /** The provider definitely refused the follow-up. */
    followUpRejected: 'followup-delivery-rejected',
    /** Busy or transient failures outlasted `followUpDeliveryDeadlineMs`. */
    followUpTimeout: 'followup-delivery-timeout',
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
    if (now - Date.parse(firstAttemptAt) >= followUpDeliveryDeadlineMs) {
        return {
            kind: 'reject',
            rejection: {
                errorCode: cloudAgentDeliveryFailure.followUpTimeout,
                summary: bounded(
                    `The provider did not accept the follow-up within ${followUpDeliveryDeadlineMs / 60_000} minutes (${attempts} attempts). Last error: ${lastError}`
                ),
            },
        };
    }
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    return {
        kind: 'retry',
        delivery: {
            attempts,
            firstAttemptAt,
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
