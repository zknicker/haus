/**
 * Whole-stop bound. It must land before the first supervisor hard kill so the
 * "still pending" line and exit code 1 are always observed: launchd's default
 * ExitTimeOut of 20s in production (`com.haus.server.plist` sets none) and the
 * dev stack's 30s hard kill.
 */
export const serverStopDeadlineMs = 15_000;

export type StopSignal = 'SIGINT' | 'SIGTERM';

export interface ServerStopInput {
    close(): Promise<void>;
    deadlineMs?: number;
    /** Ends the process. A signal handler replaces the default exit, so stop must end it. */
    exit(code: number): void;
    log(line: string): void;
    reportFailure(error: unknown): void;
    signal: string;
}

/** The part of `process` that delivers stop signals. */
export interface StopSignalSource {
    on(signal: StopSignal, listener: () => void): unknown;
}

/**
 * The first SIGTERM or SIGINT starts a bounded stop. Any later signal of
 * either kind is the operator insisting, so it exits 1 at once without
 * waiting for the close.
 */
export function handleStopSignals(
    signals: StopSignalSource,
    stop: Omit<ServerStopInput, 'signal'>
): void {
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        signals.on(signal, () => {
            if (stopping) {
                stop.log('[haus] second signal; exiting now');
                stop.exit(1);
                return;
            }
            stopping = true;
            void stopServer({ ...stop, signal });
        });
    }
}

/**
 * Closes the Server for a stop signal and always ends the process. Installing
 * a signal handler cancels the default exit, and `bun --watch` keeps an
 * emptied event loop alive waiting for file changes, so a drained Server
 * would otherwise idle until the dev stack's 30s hard kill.
 */
export async function stopServer(input: ServerStopInput): Promise<void> {
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    const deadlineMs = input.deadlineMs ?? serverStopDeadlineMs;
    input.log(`[haus] shutdown started (${input.signal})`);

    let deadline: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
        input.close().then(
            () => 'closed' as const,
            (error: unknown) => {
                input.reportFailure(error);
                return 'failed' as const;
            }
        ),
        new Promise<'pending'>((resolve) => {
            deadline = setTimeout(() => resolve('pending'), deadlineMs);
        }),
    ]);
    clearTimeout(deadline);

    if (outcome === 'pending') {
        input.log(`[haus] shutdown still pending after ${elapsed()}ms; exiting`);
        input.exit(1);
        return;
    }
    input.log(`[haus] shutdown finished in ${elapsed()}ms`);
    input.exit(outcome === 'closed' ? 0 : 1);
}
