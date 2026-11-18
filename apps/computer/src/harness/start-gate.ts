import { settle } from '@haus/effect';
import { Data, Duration, Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';

/** Machine-wide cap on concurrent runtime starts, so a reconnect cannot launch every Agent at once. */
export const maxConcurrentHarnessStarts = 5;
/** A runtime start that has not produced a live session by now fails the turn for retry. */
export const harnessStartupDeadlineMs = 120_000;

export class HarnessStartupTimeoutError extends Error {
    constructor(deadlineMs: number) {
        super(
            `The Agent runtime did not finish starting within ${Math.round(deadlineMs / 1000)} seconds (startup timed out).`
        );
        this.name = 'HarnessStartupTimeoutError';
    }
}

class HarnessStartFailure extends Data.TaggedError('HarnessStartFailure')<{
    readonly cause: unknown;
}> {}

export interface StartupWindow {
    /** True once the caller stopped waiting; late sessions must be destroyed, not used. */
    abandoned(): boolean;
    signal: AbortSignal;
}

/**
 * Runs one runtime start inside the machine-wide start gate, then races it against the startup
 * deadline and the turn's abort. The deadline starts once the gate admits the start. Adapters
 * may ignore the abort signal, so the caller is released on time and the start is abandoned.
 */
export function runHarnessStart<T>(
    runtime: DaemonRuntime,
    outer: AbortSignal | undefined,
    deadlineMs: number,
    operation: (window: StartupWindow) => Promise<T>
): Promise<T> {
    const start = Effect.tryPromise({
        catch: (cause) => new HarnessStartFailure({ cause }),
        try: (signal) => operation({ abandoned: () => signal.aborted, signal }),
    }).pipe(
        Effect.timeoutFail({
            duration: Duration.millis(deadlineMs),
            onTimeout: () =>
                new HarnessStartFailure({ cause: new HarnessStartupTimeoutError(deadlineMs) }),
        }),
        startGate(runtime).withPermits(1)
    );
    return settle(runtime, start, {
        mapFailure: (failure) => failure.cause,
        onInterrupted: () => {
            throw outer?.reason ?? new Error('The Agent runtime start was interrupted.');
        },
        signal: outer,
    });
}

const gates = new WeakMap<DaemonRuntime, Effect.Semaphore>();

function startGate(runtime: DaemonRuntime): Effect.Semaphore {
    let gate = gates.get(runtime);
    if (!gate) {
        gate = runtime.runSync(Effect.makeSemaphore(maxConcurrentHarnessStarts));
        gates.set(runtime, gate);
    }
    return gate;
}
