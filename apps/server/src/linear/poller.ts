/** A worker loop the delivery and outbox workers share. */
export interface LinearPoller {
    /** Stops the schedule and waits for the batch in flight. */
    close(): Promise<void>;
    /** Runs a batch now (after a commit that queued work); coalesces while one runs. */
    kick(): void;
}

/**
 * Runs `batch` every `intervalMs` and on every kick, one batch at a time. A
 * kick during a batch runs one more batch right after, so work committed
 * mid-batch is never left for the next tick. A batch reporting a full page
 * runs again at once. A failing batch is logged by name; the next tick retries.
 */
export function startLinearPoller(options: {
    batch(): Promise<{ more: boolean }>;
    intervalMs: number;
    name: string;
}): LinearPoller {
    let closing = false;
    let again = false;
    let inFlight: Promise<void> | null = null;

    const run = (): void => {
        if (closing) {
            return;
        }
        if (inFlight) {
            again = true;
            return;
        }
        again = false;
        inFlight = options
            .batch()
            .then((result) => {
                again = again || result.more;
            })
            .catch((error: unknown) => {
                console.error(
                    `[haus] the ${options.name} failed`,
                    error instanceof Error ? error.name : 'unknown error'
                );
            })
            .finally(() => {
                inFlight = null;
                if (again) {
                    run();
                }
            });
    };

    const interval = setInterval(run, options.intervalMs);
    interval.unref?.();
    run();

    return {
        async close() {
            closing = true;
            clearInterval(interval);
            await inFlight;
        },
        kick: run,
    };
}
