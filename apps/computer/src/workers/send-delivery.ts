import type { WorkerLaunchRefusedErrorCode } from '@haus/api';
import { WorkerLaunchRejectedError } from './provider.ts';
import type { WorkerSendingTurn, WorkerTurnRejection } from './turn-record.ts';

/**
 * How long a follow-up keeps retrying, after its first send attempt fails
 * retryably, before `send-queue.ts` tries the auto-interrupt fallback. The
 * clock starts at the first attempt, not at acceptance: waiting behind an
 * earlier turn that is still running is legitimate for hours and is never
 * governed by this constant.
 */
export const followUpInterruptGraceMs = 2 * 60_000;
const firstBackoffMs = 5000;
const maxBackoffMs = 60_000;

/** Codes a turn settles with when its prompt never reached the provider. */
export const workerDeliveryFailure = {
    /** The provider definitely refused the launch. */
    launchRejected: 'provider-launch-rejected',
    /** The provider definitely refused the follow-up. */
    followUpRejected: 'followup-delivery-rejected',
} as const satisfies Record<string, WorkerLaunchRefusedErrorCode>;

export type SendOutcome =
    | { kind: 'reject'; rejection: WorkerTurnRejection }
    | { kind: 'retry'; delivery: NonNullable<WorkerSendingTurn['delivery']> };

/** What one failed follow-up send means for its turn. */
export function sendFailureOutcome(
    sending: WorkerSendingTurn,
    cause: unknown,
    now: number
): SendOutcome {
    if (cause instanceof WorkerLaunchRejectedError) {
        return {
            kind: 'reject',
            rejection: {
                errorCode: workerDeliveryFailure.followUpRejected,
                summary: bounded(`The provider rejected the follow-up: ${reasonOf(cause)}`),
            },
        };
    }
    const attempts = (sending.delivery?.attempts ?? 0) + 1;
    const firstAttemptAt = sending.delivery?.firstAttemptAt ?? new Date(now).toISOString();
    const lastError = bounded(errorMessage(cause), 500);
    const backoff = Math.min(firstBackoffMs * 2 ** (attempts - 1), maxBackoffMs);
    return {
        kind: 'retry',
        delivery: {
            attempts,
            firstAttemptAt,
            interruptedAt: sending.delivery?.interruptedAt ?? null,
            lastError,
            nextAttemptAt: new Date(now + backoff).toISOString(),
        },
    };
}

/** A follow-up waits out its backoff before the next attempt. */
export function deliveryDue(sending: WorkerSendingTurn, now: number): boolean {
    return !sending.delivery || Date.parse(sending.delivery.nextAttemptAt) <= now;
}

export function launchRejection(cause: unknown): WorkerTurnRejection {
    return {
        errorCode: workerDeliveryFailure.launchRejected,
        summary: bounded(`The provider rejected the launch: ${reasonOf(cause)}`),
    };
}

function reasonOf(cause: unknown): string {
    const message = errorMessage(cause);
    return cause instanceof WorkerLaunchRejectedError && cause.providerCode
        ? `${message} (${cause.providerCode})`
        : message;
}

function errorMessage(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : String(cause);
    return message.trim() || 'unknown error';
}

/** Turn summaries are bounded at 2,000 characters on the wire. */
function bounded(text: string, limit = 1000): string {
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
