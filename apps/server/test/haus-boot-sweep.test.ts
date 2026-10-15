import { expect, test } from 'bun:test';
import { type SweepTimers, startBootSweep } from '../src/boot-sweep.ts';

/**
 * A boot sweep writes, so shutting the Server down has to wait for the write
 * in flight: closing the pool underneath an open delete or close transaction
 * fails it for no reason, and a test that closes its Server would see it.
 */

test('close resolves only once the run in flight has settled', async () => {
    const gate = deferred();
    let ran = false;
    const sweep = startBootSweep({
        intervalMs: 60_000,
        name: 'test sweep',
        run: async () => {
            await gate.promise;
            ran = true;
        },
        timers: inertTimers(),
    });

    let closed = false;
    const closing = sweep.close().then(() => {
        closed = true;
    });
    await settleMicrotasks();

    expect(closed).toBe(false);
    expect(ran).toBe(false);

    gate.resolve();
    await closing;
    expect(ran).toBe(true);
});

test('close resolves after a failing run, which is logged by name', async () => {
    const gate = deferred();
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
        logged.push(args);
    };
    try {
        const sweep = startBootSweep({
            intervalMs: 60_000,
            name: 'test sweep',
            run: async () => {
                await gate.promise;
                throw new Error('the sweep exploded');
            },
            timers: inertTimers(),
        });
        gate.resolve();

        await sweep.close();
    } finally {
        console.error = originalError;
    }

    expect(logged).toEqual([['[haus] the test sweep failed', 'Error']]);
});

test('close aborts the signal the run in flight receives', async () => {
    const gate = deferred();
    const seen: AbortSignal[] = [];
    const sweep = startBootSweep({
        intervalMs: 60_000,
        name: 'test sweep',
        run: async (closing) => {
            seen.push(closing);
            await gate.promise;
        },
        timers: inertTimers(),
    });
    expect(seen.map((signal) => signal.aborted)).toEqual([false]);
    const closed = sweep.close();
    expect(seen.map((signal) => signal.aborted)).toEqual([true]);
    gate.resolve();
    await closed;
});

test('a scheduled tick after close starts nothing', async () => {
    const timers = inertTimers();
    let runs = 0;
    const sweep = startBootSweep({
        intervalMs: 60_000,
        name: 'test sweep',
        run: () => {
            runs += 1;
            return Promise.resolve();
        },
        timers,
    });

    await sweep.close();
    timers.tick();

    expect(runs).toBe(1);
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function inertTimers(): SweepTimers & { tick(): void } {
    let scheduled: (() => void) | null = null;
    return {
        clearInterval: () => undefined,
        setInterval: (callback: () => void) => {
            scheduled = callback;
            return Symbol('timer') as unknown as ReturnType<typeof setInterval>;
        },
        tick: () => scheduled?.(),
    };
}

function settleMicrotasks() {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}
