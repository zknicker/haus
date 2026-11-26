import { expect, test } from 'bun:test';
import { manualClock } from '../manual-clock.ts';
import { WarmPool, warmIdleMs } from '../turn/warm-pool.ts';
import { type ClaudeSlot, ClaudeSlots } from './claude-slots.ts';

const minute = 60_000;

test('the seventh Claude process waits, and the first turn to wait is the first admitted', async () => {
    const runner = admission(6);
    for (const process of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) {
        expect((await runner.start(process)).waitedMs).toBeNull();
    }
    const seventh = runner.start('p7');
    const eighth = runner.start('p8');
    expect(runner.slots.waiting).toBe(2);
    expect(runner.slots.inUse).toBe(6);

    runner.exit('p1');
    expect((await seventh).waitedMs).toBe(0);
    expect(runner.slots.waiting).toBe(1);

    runner.exit('p2');
    await eighth;
    expect(runner.slots.waiting).toBe(0);
    expect(runner.slots.inUse).toBe(6);
});

test('a turn evicts the least recently used warm process before it waits on a live one', async () => {
    const runner = admission(2);
    await runner.start('p1');
    await runner.start('p2');
    runner.park('p1');
    runner.park('p2');
    expect(runner.evicted).toEqual([]);

    const third = await runner.start('p3');
    expect(third.waitedMs).toBe(0);
    expect(runner.evicted).toEqual(['p1']);
    expect(runner.pool.size).toBe(1);
});

test('a parked process that already exited does not strand a waiting turn', async () => {
    const runner = admission(2);
    await runner.start('p1');
    await runner.start('p2');
    runner.park('p1');
    runner.park('p2');
    runner.exit('p1');
    await runner.start('p3');

    const fourth = runner.start('p4');
    expect(runner.slots.waiting).toBe(0);
    expect(runner.evicted).toEqual(['p1', 'p2']);
    await fourth;
});

test('a process that parks while turns wait is evicted to admit the next one', async () => {
    const runner = admission(1);
    await runner.start('p1');
    const second = runner.start('p2');
    expect(runner.evicted).toEqual([]);
    expect(runner.slots.waiting).toBe(1);

    runner.park('p1');
    await second;
    expect(runner.evicted).toEqual(['p1']);
    expect(runner.pool.size).toBe(0);
});

test('a waiting turn has no deadline: it waits as long as it takes and leaves only on abort', async () => {
    const runner = admission(1);
    await runner.start('p1');
    const stop = new AbortController();
    const abandoned = runner.start('p2', stop.signal);
    const patient = runner.start('p3');
    runner.time.advance(10 * minute);
    expect(runner.slots.waiting).toBe(2);

    stop.abort(new Error('The turn was stopped.'));
    await expect(abandoned).rejects.toThrow('The turn was stopped.');
    expect(runner.slots.waiting).toBe(1);

    runner.exit('p1');
    expect((await patient).waitedMs).toBe(10 * minute);
    runner.exit('p1');
    expect(runner.slots.inUse).toBe(1);
});

function admission(limit: number) {
    const time = manualClock();
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    const held = new Map<string, ClaudeSlot>();
    const exited = new Set<string>();
    const evicted: string[] = [];
    const slots = new ClaudeSlots({
        evict: () => {
            for (const process of pool.evictOldest((candidate) => !exited.has(candidate))) {
                evicted.push(process);
                held.get(process)?.release();
            }
        },
        limit,
        now: time.now,
    });
    return {
        evicted,
        exit: (process: string) => {
            exited.add(process);
            held.get(process)?.release();
        },
        park: (process: string) => {
            pool.park(
                process,
                { launchKey: 'launch', nativeSessionId: process },
                process,
                time.now()
            );
            slots.parked();
        },
        pool,
        slots,
        start: async (process: string, signal?: AbortSignal) => {
            const slot = await slots.acquire(signal);
            held.set(process, slot);
            return slot;
        },
        time,
    };
}
