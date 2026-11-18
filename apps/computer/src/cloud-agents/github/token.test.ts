import { afterAll, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { Fiber, TestClock } from 'effect';
import { createGithubTokenReader } from './token.ts';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

test('each daemon reader caches its own credential and its negative answer', async () => {
    let reads = 0;
    const token = createGithubTokenReader(() => {
        reads += 1;
        return {
            exited: Promise.resolve(0),
            kill: () => undefined,
            stdout: new Blob(['fixture-token']).stream(),
        };
    });
    expect(await runtime.runPromise(token)).toBe('fixture-token');
    expect(await runtime.runPromise(token)).toBe('fixture-token');
    expect(reads).toBe(1);
    const missing = createGithubTokenReader(() => {
        reads += 1;
        throw new Error('not installed');
    });
    expect(await runtime.runPromise(missing)).toBeNull();
    expect(await runtime.runPromise(missing)).toBeNull();
    expect(reads).toBe(2);
});

test('interrupting token discovery kills and joins the child before returning', async () => {
    const started = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<number>();
    let killed = false;
    const token = createGithubTokenReader(() => {
        started.resolve();
        return {
            exited: exited.promise,
            kill: () => {
                killed = true;
                exited.resolve(137);
            },
            stdout: new Blob([]).stream(),
        };
    });
    const fiber = runtime.runFork(token);
    await started.promise;
    await runtime.runPromise(Fiber.interrupt(fiber));
    expect(killed).toBe(true);
    expect(await exited.promise).toBe(137);
});

test('token discovery uses a virtual deadline and still joins process cleanup', async () => {
    const started = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<number>();
    const token = createGithubTokenReader(() => {
        started.resolve();
        return {
            exited: exited.promise,
            kill: () => exited.resolve(137),
            stdout: new Blob([]).stream(),
        };
    });
    const reading = runtime.runPromise(token);
    await started.promise;
    await runtime.runPromise(TestClock.adjust('5 seconds'));
    expect(await reading).toBeNull();
    expect(await exited.promise).toBe(137);
});

test('cancelling discovery reaps a real subprocess before the fiber closes', async () => {
    const spawned = Promise.withResolvers<Bun.Subprocess<'ignore', 'pipe', 'ignore'>>();
    const token = createGithubTokenReader(() => {
        const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: 'ignore',
        });
        spawned.resolve(child);
        return child;
    });
    const fiber = runtime.runFork(token);
    const child = await spawned.promise;
    await runtime.runPromise(Fiber.interrupt(fiber));
    expect(await child.exited).toBe(137);
    expect(child.signalCode).toBe('SIGKILL');
});

test('a killed stdout read cannot turn an optional timeout into a finalizer defect', async () => {
    const started = Promise.withResolvers<void>();
    const exited = Promise.withResolvers<number>();
    let failRead: () => void = () => undefined;
    const stdout = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
            failRead = () => controller.error(new Error('pipe closed'));
        },
    });
    const token = createGithubTokenReader(() => {
        started.resolve();
        return {
            exited: exited.promise,
            kill: () => {
                failRead();
                exited.resolve(137);
            },
            stdout,
        };
    });
    const reading = runtime.runPromise(token);
    await started.promise;
    await runtime.runPromise(TestClock.adjust('5 seconds'));
    expect(await reading).toBeNull();
});
