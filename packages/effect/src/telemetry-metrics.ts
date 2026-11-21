import { Cause, Clock, Effect, Exit, Metric, MetricBoundaries } from 'effect';

export type TelemetryOutcome = 'failure' | 'interruption' | 'success';

const operationCount = Metric.counter('haus.operation.count', {
    description: 'Completed Haus operations.',
    incremental: true,
});
const operationDuration = Metric.histogram(
    'haus.operation.duration',
    MetricBoundaries.fromIterable([
        1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 120_000, 300_000,
        600_000, 1_200_000, 1_800_000, 3_600_000,
    ]),
    'Haus operation duration in milliseconds.'
).pipe(Metric.tagged('unit', 'ms'));

export function instrumentOperation<A, E, R>(
    effect: Effect.Effect<A, E, R>,
    operation: string,
    outcomeFromResult?: (value: A) => TelemetryOutcome
): Effect.Effect<A, E, R> {
    return Clock.currentTimeNanos.pipe(
        Effect.flatMap((startedAt) =>
            effect.pipe(
                Effect.onExit((exit) =>
                    Clock.currentTimeNanos.pipe(
                        Effect.flatMap((endedAt) =>
                            recordOperation(
                                operation,
                                Exit.isSuccess(exit)
                                    ? safeOutcomeFromResult(exit.value, outcomeFromResult)
                                    : outcomeFromCause(exit.cause),
                                Number(endedAt - startedAt) / 1_000_000
                            )
                        )
                    )
                )
            )
        )
    );
}

export function recordOperation(
    operation: string,
    outcome: TelemetryOutcome,
    durationMs: number
): Effect.Effect<void> {
    const taggedCount = operationCount.pipe(
        Metric.tagged('operation', operation),
        Metric.tagged('outcome', outcome)
    );
    const taggedDuration = operationDuration.pipe(
        Metric.tagged('operation', operation),
        Metric.tagged('outcome', outcome)
    );
    return Metric.increment(taggedCount).pipe(
        Effect.zipRight(Metric.update(taggedDuration, durationMs))
    );
}

function outcomeFromCause<E>(cause: Cause.Cause<E>): TelemetryOutcome {
    return Cause.isInterruptedOnly(cause) ? 'interruption' : 'failure';
}

export function safeOutcomeFromResult<A>(
    value: A,
    outcomeFromResult?: (value: A) => TelemetryOutcome
): TelemetryOutcome {
    if (!outcomeFromResult) {
        return 'success';
    }
    try {
        return outcomeFromResult(value);
    } catch {
        return 'success';
    }
}
