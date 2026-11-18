import { Cause, Exit } from 'effect';
import type { TelemetryOutcome } from './telemetry-metrics.ts';

export type ObservedTelemetryResult<A> = readonly [value: A, outcome: TelemetryOutcome];

class TelemetrySpanFailure extends Error {
    constructor() {
        super('A Haus operation failed.');
        this.name = 'TelemetrySpanFailure';
    }
}

/** Remove Effect's span annotation proxies before returning an operation Exit. */
export function originalTelemetryExit<A, E>(exit: Exit.Exit<A, E>): Exit.Exit<A, E> {
    return Exit.isSuccess(exit) ? exit : Exit.failCause(originalCause(exit.cause));
}

/** Build the content-free Exit used only to close the OpenTelemetry span. */
export function telemetrySpanExit<A, E>(
    exit: Exit.Exit<ObservedTelemetryResult<A>, E>
): Exit.Exit<void, TelemetrySpanFailure> {
    if (Exit.isSuccess(exit)) {
        return exit.value[1] === 'failure' ? Exit.fail(new TelemetrySpanFailure()) : Exit.void;
    }
    if (Cause.isInterruptedOnly(exit.cause)) {
        return Exit.failCause(Cause.map(exit.cause, () => new TelemetrySpanFailure()));
    }
    return Exit.fail(new TelemetrySpanFailure());
}

function originalCause<E>(cause: Cause.Cause<E>): Cause.Cause<E> {
    return Cause.match(cause, {
        onDie: (defect) => Cause.die(Cause.originalError(defect)),
        onEmpty: Cause.empty,
        onFail: (failure) => Cause.fail(Cause.originalError(failure)),
        onInterrupt: Cause.interrupt,
        onParallel: Cause.parallel,
        onSequential: Cause.sequential,
    });
}
