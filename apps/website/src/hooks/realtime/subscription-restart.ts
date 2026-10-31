import { classifyStreamError } from './realtime-refusal.ts';

/**
 * One long-lived subscription's restart policy (specs/realtime-events.md,
 * "Recovery"). tRPC ends a subscription on its first error and never
 * resubscribes, not even when the socket reconnects, so without this a stream
 * that failed once stays dead while everything else still looks live.
 *
 * Any end that is not a refusal, a normal completion included, restarts this
 * one stream after a capped exponential backoff; a start resets the backoff.
 * Refusals follow their class: membership loss runs the Server-loss path, a
 * missing Chat runs the Chat-loss purge and stops, a role refusal stops this
 * stream, and an expired session refreshes its token before restarting.
 * Owned-read recovery runs on every start, not here (`useSubscriptionRestart`).
 */
export interface SubscriptionRestart {
    /** The stream completed normally: restart it like a failure. */
    completed: (restart: () => void) => void;
    /** Drops any pending restart, for unmount or a changed subscription input. */
    dispose: () => void;
    /** Reports `error` and answers it by its refusal class. */
    failed: (error: unknown, restart: () => void) => void;
    /** The stream started: drop any pending restart and reset the backoff. */
    started: () => void;
}

export interface SubscriptionRestartOptions {
    cancel: (handle: ReturnType<typeof setTimeout>) => void;
    /** `chat_missing`: the stream's Chat no longer exists; final for this Chat. */
    onChatMissing: () => void;
    /** `membership_lost`: final for every stream of the Server. */
    onMembershipLost: () => void;
    /** `UNAUTHORIZED`: refresh the App session; false when Haus confirms sign-out. */
    refreshSession: () => Promise<boolean>;
    report: (message: string, error: unknown) => void;
    schedule: (run: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    stream: string;
}

export const subscriptionRestartInitialDelayMs = 1000;
export const subscriptionRestartMaxDelayMs = 30_000;

export function createSubscriptionRestart(
    options: SubscriptionRestartOptions
): SubscriptionRestart {
    const { cancel, report, schedule, stream } = options;
    let attempt = 0;
    let disposed = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const dispose = () => {
        disposed += 1;
        if (pending !== null) {
            cancel(pending);
            pending = null;
        }
    };
    const scheduleRestart = (restart: () => void) => {
        const delayMs = subscriptionRestartDelayMs(attempt);
        attempt += 1;
        pending = schedule(() => {
            pending = null;
            restart();
        }, delayMs);
        return delayMs;
    };

    return {
        completed(restart) {
            dispose();
            const delayMs = scheduleRestart(restart);
            report(`[haus] ${stream} completed; restarting in ${delayMs} ms`, null);
        },
        dispose,
        failed(error, restart) {
            dispose();
            const end = classifyStreamError(error);
            if (end === 'membership_lost') {
                report(`[haus] ${stream} lost Server membership; not restarting`, error);
                options.onMembershipLost();
                return;
            }
            if (end === 'chat_missing') {
                report(`[haus] ${stream} names a Chat the Server no longer has; stopping`, error);
                options.onChatMissing();
                return;
            }
            if (end === 'role_required') {
                report(`[haus] ${stream} needs a role the viewer lacks; stopping`, error);
                return;
            }
            if (end === 'unauthorized') {
                report(`[haus] ${stream} was unauthorized; refreshing the session`, error);
                const generation = disposed;
                void options.refreshSession().then(
                    (signedIn) => {
                        // A newer failure, start, or unmount owns the stream now.
                        if (signedIn && generation === disposed) {
                            scheduleRestart(restart);
                        }
                    },
                    () => {
                        if (generation === disposed) {
                            scheduleRestart(restart);
                        }
                    }
                );
                return;
            }
            const delayMs = scheduleRestart(restart);
            report(`[haus] ${stream} failed; restarting in ${delayMs} ms`, error);
        },
        started() {
            dispose();
            attempt = 0;
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
