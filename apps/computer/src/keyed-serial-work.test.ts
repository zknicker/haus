import { expect, test } from 'bun:test';
import { Runtime } from 'effect';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { KeyedSerialWork } from './keyed-serial-work.ts';

test('evicts high-cardinality keys after their work becomes idle', async () => {
    const runtime = makeDaemonRuntime();
    const work = new KeyedSerialWork(runtime);
    try {
        await Promise.all(
            Array.from({ length: 1000 }, (_, index) =>
                work.run(`journal:${index}`, async () => index)
            )
        );
        expect(retainedKeyCount(work)).toBe(0);
    } finally {
        await work.close();
        await runtime.dispose();
    }
});

test('serializes queued work for the same key before evicting it', async () => {
    const runtime = makeDaemonRuntime();
    const work = new KeyedSerialWork(runtime);
    const release = Promise.withResolvers<void>();
    const events: string[] = [];
    try {
        const first = work.run('journal:shared', async () => {
            events.push('first started');
            await release.promise;
            events.push('first finished');
        });
        const second = work.run('journal:shared', async () => {
            events.push('second started');
        });

        await Promise.resolve();
        expect(events).toEqual(['first started']);
        expect(retainedKeyCount(work)).toBe(1);
        release.resolve();
        await Promise.all([first, second]);
        expect(events).toEqual(['first started', 'first finished', 'second started']);
        expect(retainedKeyCount(work)).toBe(0);
    } finally {
        release.resolve();
        await work.close();
        await runtime.dispose();
    }
});

test('a failed operation releases its permit without poisoning queued work', async () => {
    const runtime = makeDaemonRuntime();
    const work = new KeyedSerialWork(runtime);
    const events: string[] = [];
    try {
        const failed = work.run('journal:shared', async () => {
            events.push('failed');
            throw new Error('journal write failed');
        });
        const recovered = work.run('journal:shared', async () => {
            events.push('recovered');
        });

        await expect(failed).rejects.toThrow('journal write failed');
        await expect(recovered).resolves.toBeUndefined();
        expect(events).toEqual(['failed', 'recovered']);
        expect(retainedKeyCount(work)).toBe(0);

        await expect(
            work.run('journal:shared', async () => {
                events.push('later');
            })
        ).resolves.toBeUndefined();
        expect(events).toEqual(['failed', 'recovered', 'later']);
        expect(retainedKeyCount(work)).toBe(0);
    } finally {
        await work.close();
        await runtime.dispose();
    }
});

test('preserves the original foreign operation failure at the Promise seam', async () => {
    const runtime = makeDaemonRuntime();
    const work = new KeyedSerialWork(runtime);
    const failure = new Error('foreign operation failed');
    try {
        await expect(
            work.run('journal:identity', async () => Promise.reject(failure))
        ).rejects.toBe(failure);
    } finally {
        await work.close();
        await runtime.dispose();
    }
});

test('shutdown interrupts active and queued work and evicts their key', async () => {
    const runtime = makeDaemonRuntime();
    const work = new KeyedSerialWork(runtime);
    const started = Promise.withResolvers<void>();
    let foreignAbortObserved = false;
    const active = work.run('journal:shared', (signal) => {
        started.resolve();
        return new Promise<void>(() => {
            signal.addEventListener('abort', () => {
                foreignAbortObserved = true;
            });
        });
    });
    await started.promise;
    const queued = work.run('journal:shared', async () => undefined);

    await work.close();

    expect(Runtime.isFiberFailure(await active.catch((cause) => cause))).toBe(true);
    expect(Runtime.isFiberFailure(await queued.catch((cause) => cause))).toBe(true);
    expect(foreignAbortObserved).toBe(true);
    expect(retainedKeyCount(work)).toBe(0);
    await runtime.dispose();
});

function retainedKeyCount(work: KeyedSerialWork<never>): number {
    return (work as unknown as { entries: ReadonlyMap<string, unknown> }).entries.size;
}
