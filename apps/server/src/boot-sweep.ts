/** Interval seam, so a test can start a sweep without a live timer. */
export interface SweepTimers {
    clearInterval(timer: ReturnType<typeof setInterval>): void;
    setInterval(callback: () => void, milliseconds: number): ReturnType<typeof setInterval>;
}

export interface BootSweep {
    /** Stops the schedule and resolves once any in-flight run has settled. */
    close(): Promise<void>;
}

/**
 * A maintenance pass that runs once at boot and on a fixed interval after
 * that, with at most one run in flight.
 *
 * `close` waits for the run in flight because these sweeps write: a delete or
 * a close transaction still open when the Server tears its pool down fails
 * with a shutdown error nobody asked for, and a test that closes its Server
 * would see it. The wait is the same contract `ReminderScheduler.close` keeps.
 *
 * A failing run is logged by name and swallowed; the next interval retries.
 */
export function startBootSweep(options: {
    intervalMs: number;
    /** Names the sweep in the one operational line a failure logs. */
    name: string;
    /** `closing` aborts on `close`; a long run checks it between steps so shutdown stays prompt. */
    run(closing: AbortSignal): Promise<unknown>;
    timers?: SweepTimers;
}): BootSweep {
    const timers = options.timers ?? defaultSweepTimers;
    const closing = new AbortController();
    let inFlight: Promise<void> | null = null;

    const run = () => {
        if (inFlight || closing.signal.aborted) {
            return;
        }
        inFlight = options
            .run(closing.signal)
            .then(() => undefined)
            .catch((error: unknown) => {
                console.error(
                    `[haus] the ${options.name} failed`,
                    error instanceof Error ? error.name : 'unknown error'
                );
            })
            .finally(() => {
                inFlight = null;
            });
    };

    const interval = timers.setInterval(run, options.intervalMs);
    interval.unref?.();
    run();

    return {
        async close() {
            closing.abort();
            timers.clearInterval(interval);
            await inFlight;
        },
    };
}

const defaultSweepTimers: SweepTimers = {
    clearInterval: (timer) => clearInterval(timer),
    setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
};
