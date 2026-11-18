import { afterAll, expect, test } from 'bun:test';
import { Cause, Effect, Fiber } from 'effect';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import {
    createReminderScriptExecution,
    ReminderScriptExecutionFailure,
} from './reminder-script-execution.ts';

const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

test('retains a stream-drain defect from interruption cleanup in the Cause', async () => {
    const encoderDefect = new Error('stdout encoder failed');
    let release: (() => void) | undefined;
    let resolveStarted: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        resolveStarted = resolve;
    });
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => release?.());
            resolveStarted?.();
            return {
                exited: released.then(() => 0),
                stderr: closedStream(''),
                stdout: errorAfter(released, encoderDefect),
            };
        },
    });
    const fiber = runtime.runFork(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));
    await started;

    const exit = await runtime.runPromise(Fiber.interrupt(fiber));

    if (exit._tag !== 'Failure') {
        throw new Error('Expected interrupted cleanup to retain a failure Cause.');
    }
    expect([...Cause.defects(exit.cause)]).toEqual([
        expect.objectContaining({
            _tag: 'ReminderScriptExecutionFailure',
            cause: encoderDefect,
            operation: 'process-settlement',
        }),
    ]);
});

test('a synchronous spawn failure escapes the scoped execution', async () => {
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: () => {
            throw new Error('spawn failed');
        },
    });

    await expect(
        runtime.runPromise(execute({ cwd: '/tmp', env: {}, script: 'ignored' }))
    ).rejects.toThrow('spawn failed');
});

test('maps a foreign spawn failure to a tagged process boundary failure', async () => {
    const cause = new Error('spawn failed');
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: () => {
            throw cause;
        },
    });

    const exit = await runtime.runPromiseExit(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));

    if (exit._tag !== 'Failure') {
        throw new Error('Expected reminder execution to fail.');
    }
    expect([...Cause.failures(exit.cause)]).toEqual([
        expect.objectContaining({
            _tag: 'ReminderScriptExecutionFailure',
            cause,
            operation: 'process-spawn',
        }),
    ]);
    expect([...Cause.failures(exit.cause)][0]).toBeInstanceOf(ReminderScriptExecutionFailure);
});

function closedStream(value: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
        },
    });
}

function errorAfter(release: Promise<void>, error: Error): ReadableStream<Uint8Array> {
    return new ReadableStream({
        async start(controller) {
            await release;
            controller.error(error);
        },
    });
}
