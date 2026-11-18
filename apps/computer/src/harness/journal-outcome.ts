import { Cause, Exit } from 'effect';
import type { HarnessTurnResult } from './executor.ts';
import type { HarnessStreamForeignError } from './turn-stream.ts';

export function journalOutcome(
    exit: Exit.Exit<HarnessTurnResult, HarnessStreamForeignError>,
    signal?: AbortSignal
): 'completed' | 'failed' | 'interrupted' {
    if (Exit.isSuccess(exit)) {
        return exit.value.aborted ? 'interrupted' : 'completed';
    }
    return signal?.aborted || Cause.isInterruptedOnly(exit.cause) ? 'interrupted' : 'failed';
}

export function journalError(exit: Exit.Exit<HarnessTurnResult, HarnessStreamForeignError>) {
    return Exit.isFailure(exit)
        ? Cause.pretty(Cause.map(exit.cause, (failure) => failure.cause))
        : undefined;
}
