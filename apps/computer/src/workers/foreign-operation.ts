import { Data, Effect } from 'effect';

export class WorkerOperationError extends Data.TaggedError('WorkerOperationError')<{
    readonly cause: unknown;
}> {}

/** Interruption aborts the foreign operation and joins its cleanup before returning. */
export function foreign<Value>(operation: (signal: AbortSignal) => Promise<Value>) {
    return Effect.async<Value, WorkerOperationError>((resume, signal) => {
        const pending = Promise.resolve()
            .then(() => operation(signal))
            .then(
                (value) => resume(Effect.succeed(value)),
                (cause) => resume(Effect.fail(new WorkerOperationError({ cause })))
            );
        return Effect.promise(() => pending);
    });
}
