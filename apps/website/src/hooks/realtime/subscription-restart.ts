import { isMembershipLoss } from '../servers/membership-loss.ts';

/**
 * Restarts a long-lived subscription the Server ended with an error. tRPC
 * completes a subscription on its first error and never resubscribes, not even
 * when the socket reconnects, so without this a stream that failed once stays
 * dead and its listeners go silent while everything else still looks live.
 *
 * Each failure is reported, then the subscription restarts after a capped
 * exponential backoff; a start resets the backoff. The restart's own start runs
 * the stream's usual recovery (catch-up or snapshot refresh), so nothing missed
 * while it was down stays missed. A refusal is final: losing membership or
 * authorization is handled by its owner, and retrying it would only repeat it.
 */
export interface SubscriptionRestart {
    /** Drops any pending restart, for unmount or a changed subscription input. */
    dispose: () => void;
    /** Reports `error` and schedules `restart` unless the error is a refusal. */
    failed: (error: unknown, restart: () => void) => void;
    /**
     * The subscription started: cancel any pending restart and reset the
     * backoff. True when this start recovers from a failure, for a stream whose
     * reads otherwise recover only on a socket reconnect.
     */
    started: () => boolean;
}

export const subscriptionRestartInitialDelayMs = 1000;
export const subscriptionRestartMaxDelayMs = 30_000;

export function createSubscriptionRestart({
    cancel,
    report,
    schedule,
    stream,
}: {
    cancel: (handle: ReturnType<typeof setTimeout>) => void;
    report: (message: string, error: unknown) => void;
    schedule: (run: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    stream: string;
}): SubscriptionRestart {
    let attempt = 0;
    let failedSinceStart = false;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const dispose = () => {
        if (pending !== null) {
            cancel(pending);
            pending = null;
        }
    };

    return {
        dispose,
        failed(error, restart) {
            dispose();
            if (isSubscriptionRefusal(error)) {
                report(`[haus] ${stream} was refused; not restarting`, error);
                return;
            }
            const delayMs = subscriptionRestartDelayMs(attempt);
            attempt += 1;
            failedSinceStart = true;
            report(`[haus] ${stream} failed; restarting in ${delayMs} ms`, error);
            pending = schedule(() => {
                pending = null;
                restart();
            }, delayMs);
        },
        started() {
            dispose();
            attempt = 0;
            const recovered = failedSinceStart;
            failedSinceStart = false;
            return recovered;
        },
    };
}

/** 1 s, 2 s, 4 s, … capped at 30 s. */
export function subscriptionRestartDelayMs(attempt: number): number {
    return Math.min(
        subscriptionRestartInitialDelayMs * 2 ** attempt,
        subscriptionRestartMaxDelayMs
    );
}

/** A refusal the Server will repeat: lost membership, or no valid session. */
export function isSubscriptionRefusal(error: unknown): boolean {
    return isMembershipLoss(error) || readErrorCode(error) === 'UNAUTHORIZED';
}

function readErrorCode(error: unknown): unknown {
    if (typeof error !== 'object' || error === null || !('data' in error)) {
        return undefined;
    }
    const { data } = error as { data: unknown };
    return typeof data === 'object' && data !== null && 'code' in data
        ? (data as { code: unknown }).code
        : undefined;
}
