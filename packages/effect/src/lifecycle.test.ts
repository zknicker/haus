import { expect, test } from 'bun:test';
import { Cause, Effect, Fiber, FiberId, Option, Runtime, TestClock } from 'effect';
import { settle } from './boundary.ts';
import { makeTestRuntime } from './testing.ts';

test('TestClock controls a fiber launched through the test runtime', async () => {
    const runtime = makeTestRuntime();
    try {
        const fiber = runtime.runFork(Effect.sleep('5 seconds').pipe(Effect.as('finished')));
        expect(Option.isNone(await runtime.runPromise(Fiber.poll(fiber)))).toBe(true);

        const completion = runtime.runPromise(Fiber.join(fiber));
        await runtime.runPromise(TestClock.adjust('5 seconds'));

        await expect(completion).resolves.toBe('finished');
    } finally {
        await runtime.dispose();
    }
});

test('settlement preserves a standalone typed failure', async () => {
    const runtime = makeTestRuntime();
    const expectedFailure = { _tag: 'ExpectedFailure' } as const;
    try {
        await expect(settle(runtime, Effect.fail(expectedFailure))).rejects.toBe(expectedFailure);
    } finally {
        await runtime.dispose();
    }
});

test('settlement preserves a mapped foreign failure', async () => {
    const runtime = makeTestRuntime();
    const foreignFailure = new Error('foreign failure');
    try {
        await expect(
            settle(runtime, Effect.fail({ cause: foreignFailure }), {
                mapFailure: (failure) => failure.cause,
            })
        ).rejects.toBe(foreignFailure);
    } finally {
        await runtime.dispose();
    }
});

test('settlement preserves a composite Cause when a finalizer defects', async () => {
    const runtime = makeTestRuntime();
    const defect = new Error('finalizer failed');
    const effect = Effect.fail({ _tag: 'ExpectedFailure' } as const).pipe(
        Effect.ensuring(Effect.die(defect))
    );
    try {
        const rejection = settle(runtime, effect);
        await expectFiberFailure(rejection);
        await rejection.catch((error: unknown) => {
            expect(error).toBeInstanceOf(Error);
            expect(Runtime.isFiberFailure(error)).toBe(true);
        });
    } finally {
        await runtime.dispose();
    }
});

test('failure mapping does not erase a finalizer defect', async () => {
    const runtime = makeTestRuntime();
    const expectedFailure = { _tag: 'WrappedFailure', cause: new Error('foreign failure') };
    const cleanupDefect = new Error('cleanup defect');
    const effect = Effect.fail(expectedFailure).pipe(Effect.ensuring(Effect.die(cleanupDefect)));
    try {
        const rejection = settle(runtime, effect, { mapFailure: (failure) => failure.cause });
        await expectFiberFailure(rejection);
    } finally {
        await runtime.dispose();
    }
});

test('settlement preserves a Cause containing parallel expected failures', async () => {
    const runtime = makeTestRuntime();
    const first = { _tag: 'FirstFailure' } as const;
    const second = { _tag: 'SecondFailure' } as const;
    const cause = Cause.parallel(Cause.fail(first), Cause.fail(second));
    try {
        const rejection = settle(runtime, Effect.failCause(cause), {
            mapFailure: () => new Error('must not map a composite cause'),
        });
        await expectFiberFailure(rejection);
        await rejection.catch((error: unknown) => {
            expect(fiberFailureCause(error)).toBe(cause);
        });
    } finally {
        await runtime.dispose();
    }
});

test('settlement preserves a Cause containing failure and interruption', async () => {
    const runtime = makeTestRuntime();
    const cause = Cause.parallel(
        Cause.fail({ _tag: 'ExpectedFailure' } as const),
        Cause.interrupt(FiberId.none)
    );
    try {
        const rejection = settle(runtime, Effect.failCause(cause));
        await expectFiberFailure(rejection);
        await rejection.catch((error: unknown) => {
            expect(fiberFailureCause(error)).toBe(cause);
        });
    } finally {
        await runtime.dispose();
    }
});

test('settlement maps interruption only when the caller supplies a value', async () => {
    const runtime = makeTestRuntime();
    try {
        await expect(
            settle(runtime, Effect.interrupt, { onInterrupted: () => 'cancelled' })
        ).resolves.toBe('cancelled');
        await expectFiberFailure(settle(runtime, Effect.interrupt));
    } finally {
        await runtime.dispose();
    }
});

test('interruption mapping does not erase a concurrent defect', async () => {
    const runtime = makeTestRuntime();
    const defect = new Error('concurrent defect');
    const cause = Cause.parallel(Cause.interrupt(FiberId.none), Cause.die(defect));
    try {
        const rejection = settle(runtime, Effect.failCause(cause), {
            onInterrupted: () => 'cancelled',
        });
        await expectFiberFailure(rejection);
        await rejection.catch((error: unknown) => {
            expect(fiberFailureCause(error)).toBe(cause);
        });
    } finally {
        await runtime.dispose();
    }
});

test('the lifecycle logger keeps messages concise and annotations structured', async () => {
    const warnings: unknown[][] = [];
    const output = recordingConsole((values) => warnings.push([...values]));
    const runtime = makeTestRuntime({ output });
    try {
        await runtime.runPromise(
            Effect.logWarning('Reminder tick failed.').pipe(
                Effect.annotateLogs({ failureKind: 'Error', operation: 'reminder.tick' })
            )
        );
        expect(warnings).toEqual([
            ['Reminder tick failed.', { failureKind: 'Error', operation: 'reminder.tick' }],
        ]);
    } finally {
        await runtime.dispose();
    }
});

function recordingConsole(onWarning: (values: readonly unknown[]) => void) {
    const ignore = (..._values: readonly unknown[]) => undefined;
    return {
        debug: ignore,
        error: ignore,
        info: ignore,
        log: ignore,
        trace: ignore,
        warn: (...values: readonly unknown[]) => onWarning(values),
    };
}

async function expectFiberFailure(promise: Promise<unknown>): Promise<void> {
    expect(Runtime.isFiberFailure(await promise.catch((cause) => cause))).toBe(true);
}

function fiberFailureCause(cause: unknown): Cause.Cause<unknown> | undefined {
    return Runtime.isFiberFailure(cause) ? cause[Runtime.FiberFailureCauseId] : undefined;
}
