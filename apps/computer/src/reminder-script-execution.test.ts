import { afterAll, expect, test } from 'bun:test';
import { Effect, Fiber } from 'effect';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { createReminderScriptExecution } from './reminder-script-execution.ts';

const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());

test('timeout aborts once and waits for both output drains and exit', async () => {
    const events: string[] = [];
    let aborts = 0;
    let release: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    const execute = createReminderScriptExecution({
        sleep: () => Effect.void,
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => {
                aborts += 1;
                events.push('abort');
                release?.();
            });
            return {
                exited: released.then(() => {
                    events.push('exit');
                    return 9;
                }),
                stderr: streamAfter(released, 'stderr', events),
                stdout: streamAfter(released, 'stdout', events),
            };
        },
    });

    const result = await runtime.runPromise(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));

    expect(result).toEqual({ exitCode: 124, output: 'stdout\nstderr', timedOut: true });
    expect(aborts).toBe(1);
    expect(events).toContain('stdout drained');
    expect(events).toContain('stderr drained');
    expect(events).toContain('exit');
    for (const event of ['stdout drained', 'stderr drained', 'exit']) {
        expect(events.indexOf(event)).toBeGreaterThan(events.indexOf('abort'));
    }
});

test('scope interruption aborts a started child exactly once', async () => {
    let aborts = 0;
    const events: string[] = [];
    let resolveStarted: (() => void) | undefined;
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
        resolveStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => {
                aborts += 1;
                events.push('abort');
                release?.();
            });
            resolveStarted?.();
            return {
                exited: released.then(() => {
                    events.push('exit');
                    return 0;
                }),
                stderr: streamAfter(released, 'stderr', events),
                stdout: streamAfter(released, 'stdout', events),
            };
        },
    });

    const fiber = runtime.runFork(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));
    await started;
    await runtime.runPromise(Fiber.interrupt(fiber));

    expect(aborts).toBe(1);
    expect(events).toContain('stdout drained');
    expect(events).toContain('stderr drained');
    expect(events).toContain('exit');
});

test('starts stdout and stderr drains concurrently', async () => {
    let resolveStdoutStarted: (() => void) | undefined;
    let resolveStderrStarted: (() => void) | undefined;
    let resolveAbort: (() => void) | undefined;
    const stdoutStarted = new Promise<void>((resolve) => {
        resolveStdoutStarted = resolve;
    });
    const stderrStarted = new Promise<void>((resolve) => {
        resolveStderrStarted = resolve;
    });
    const aborted = new Promise<void>((resolve) => {
        resolveAbort = resolve;
    });
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => resolveAbort?.());
            return {
                exited: Promise.resolve(0),
                stderr: crossGatedStream(stdoutStarted, resolveStderrStarted, aborted, 'stderr'),
                stdout: crossGatedStream(stderrStarted, resolveStdoutStarted, aborted, 'stdout'),
            };
        },
    });
    const fiber = runtime.runFork(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));
    const bothStarted = Promise.all([stdoutStarted, stderrStarted]).then(() => true);
    const concurrent = await Promise.race([bothStarted, wait(50).then(() => false)]);
    if (!concurrent) {
        await runtime.runPromise(Fiber.interrupt(fiber));
        throw new Error('stdout and stderr drains did not start concurrently.');
    }

    const result = await runtime.runPromise(Fiber.join(fiber));

    expect(result).toEqual({ exitCode: 0, output: 'stdout\nstderr', timedOut: false });
});

test('an exit that settled before delayed output is never relabeled as timeout', async () => {
    let aborts = 0;
    let releaseOutput: (() => void) | undefined;
    let releaseTimeout: (() => void) | undefined;
    let resolveExitSettled: (() => void) | undefined;
    const outputReleased = new Promise<void>((resolve) => {
        releaseOutput = resolve;
    });
    const timeoutReleased = new Promise<void>((resolve) => {
        releaseTimeout = resolve;
    });
    const exitSettled = new Promise<void>((resolve) => {
        resolveExitSettled = resolve;
    });
    const execute = createReminderScriptExecution({
        sleep: () => Effect.promise(() => timeoutReleased),
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => {
                aborts += 1;
            });
            return {
                exited: Promise.resolve(0).then((exitCode) => {
                    resolveExitSettled?.();
                    return exitCode;
                }),
                stderr: streamAfter(outputReleased, 'stderr', []),
                stdout: streamAfter(outputReleased, 'stdout', []),
            };
        },
    });
    const fiber = runtime.runFork(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));
    await exitSettled;
    releaseTimeout?.();
    releaseOutput?.();

    const result = await runtime.runPromise(Fiber.join(fiber));

    expect(result).toEqual({ exitCode: 0, output: 'stdout\nstderr', timedOut: false });
    expect(aborts).toBe(0);
});

test('a non-timeout exit rejection becomes exit code one without aborting', async () => {
    let aborts = 0;
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: ({ signal }) => {
            signal.addEventListener('abort', () => {
                aborts += 1;
            });
            return {
                exited: Promise.reject(new Error('process start failed')),
                stderr: closedStream('stderr'),
                stdout: closedStream('stdout'),
            };
        },
    });

    const result = await runtime.runPromise(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));

    expect(result).toEqual({ exitCode: 1, output: 'stdout\nstderr', timedOut: false });
    expect(aborts).toBe(0);
});

test('preserves split UTF-8 while retaining and draining bounded bytes', async () => {
    let drained = false;
    const execute = createReminderScriptExecution({
        sleep: () => Effect.never,
        spawn: () => ({
            exited: Promise.resolve(0),
            stderr: closedStream(''),
            stdout: byteStream(
                [
                    new Uint8Array([0xf0, 0x9f]),
                    new Uint8Array([0x99, 0x82]),
                    new Uint8Array(65_532).fill(0x61),
                    new Uint8Array([0x62]),
                ],
                () => {
                    drained = true;
                }
            ),
        }),
    });

    const result = await runtime.runPromise(execute({ cwd: '/tmp', env: {}, script: 'ignored' }));

    expect(result.output.startsWith('🙂')).toBe(true);
    expect(result.output.endsWith('b')).toBe(false);
    expect(Buffer.byteLength(result.output)).toBe(65_536);
    expect(drained).toBe(true);
});

function streamAfter(
    release: Promise<void>,
    name: string,
    events: string[]
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            await release;
            controller.enqueue(encoder.encode(name));
            events.push(`${name} drained`);
            controller.close();
        },
    });
}

function closedStream(value: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
        },
    });
}

function crossGatedStream(
    otherStarted: Promise<void>,
    started: (() => void) | undefined,
    aborted: Promise<void>,
    value: string
): ReadableStream<Uint8Array> {
    return new ReadableStream({
        async start(controller) {
            started?.();
            await Promise.race([otherStarted, aborted]);
            controller.enqueue(new TextEncoder().encode(value));
            controller.close();
        },
    });
}

function byteStream(chunks: Uint8Array[], onDrained: () => void): ReadableStream<Uint8Array> {
    return new ReadableStream({
        pull(controller) {
            const chunk = chunks.shift();
            if (chunk) {
                controller.enqueue(chunk);
                return;
            }
            onDrained();
            controller.close();
        },
    });
}

function wait(durationMs: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
}
