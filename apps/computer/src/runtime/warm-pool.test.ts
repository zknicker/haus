import { expect, spyOn, test } from 'bun:test';
import { type WarmProcess, WarmProcessPool } from './warm-pool.ts';

class FakeProcess implements WarmProcess {
    alive = true;
    closes = 0;
    holdsBackgroundWork = false;
    backgroundWorkSince: number | null = null;
    private readonly ended = Promise.withResolvers<void>();
    readonly exited = this.ended.promise;

    close(): Promise<void> {
        this.closes += 1;
        this.exit();
        return Promise.resolve();
    }

    exit() {
        this.alive = false;
        this.ended.resolve();
    }
}

const isFake = (process: WarmProcess): process is FakeProcess => process instanceof FakeProcess;
const identity = { launchKey: 'launch-1', nativeSessionId: 'conversation-1', runtimeId: 'codex' };
const pool = (idleMs?: number) =>
    new WarmProcessPool({
        idleMs,
        onCloseError: (error) => {
            throw error;
        },
    });

test('the Agent’s next open claims its parked process when the identity matches', async () => {
    const warm = pool();
    const process = new FakeProcess();
    await warm.park('agent-a', identity, process);
    expect(await warm.claim('agent-b', identity, isFake)).toBeUndefined();
    expect(await warm.claim('agent-a', identity, isFake)).toBe(process);
    expect(warm.size).toBe(0);
    expect(process.closes).toBe(0);
});

test('changed launch facts, conversation, or runtime close the parked process', async () => {
    for (const change of [
        { launchKey: 'launch-2' },
        { nativeSessionId: 'conversation-2' },
        { runtimeId: 'claude-code' },
    ]) {
        const warm = pool();
        const process = new FakeProcess();
        await warm.park('agent-a', identity, process);
        expect(await warm.claim('agent-a', { ...identity, ...change }, isFake)).toBeUndefined();
        expect(process.closes).toBe(1);
    }
});

test('one process per Agent: parking a second closes the first', async () => {
    const warm = pool();
    const first = new FakeProcess();
    const second = new FakeProcess();
    await warm.park('agent-a', identity, first);
    await warm.park('agent-a', identity, second);
    expect(first.closes).toBe(1);
    expect(warm.size).toBe(1);
});

test('a process that exits while parked leaves the pool and is still closed', async () => {
    const warm = pool();
    const process = new FakeProcess();
    await warm.park('agent-a', identity, process);
    process.exit();
    await Bun.sleep(0);
    expect(warm.size).toBe(0);
    // Its close ends the descendants it left behind and revokes its host-tool scope.
    expect(process.closes).toBe(1);
});

test('an idle process closes after the idle window', async () => {
    const warm = pool(5);
    const process = new FakeProcess();
    await warm.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(process.closes).toBe(1);
    expect(warm.size).toBe(0);
});

test('the default idle window is an hour, the length of Claude Code’s prompt cache', async () => {
    const timers = spyOn(globalThis, 'setTimeout');
    try {
        const warm = pool();
        await warm.park('agent-a', identity, new FakeProcess());
        expect(timers.mock.calls.map((call) => call[1])).toContain(60 * 60_000);
        await warm.close();
    } finally {
        timers.mockRestore();
    }
});

test('a process holding background work outlives the idle window, then closes once it is done', async () => {
    const warm = pool(5);
    const process = new FakeProcess();
    process.holdsBackgroundWork = true;
    await warm.park('agent-a', identity, process);
    await Bun.sleep(25);
    expect(process.closes).toBe(0);
    expect(warm.size).toBe(1);
    process.holdsBackgroundWork = false;
    await Bun.sleep(25);
    expect(process.closes).toBe(1);
    expect(warm.size).toBe(0);
});

test('background work past its lifetime no longer exempts the process from the idle close', async () => {
    const warm = new WarmProcessPool({
        backgroundLimitMs: 40,
        idleMs: 5,
        onCloseError: (error) => {
            throw error;
        },
    });
    const process = new FakeProcess();
    process.holdsBackgroundWork = true;
    process.backgroundWorkSince = Date.now();
    await warm.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(process.closes).toBe(0);
    // A hung task: the process closes as an unplanned end, so the Agent hears it stopped.
    await Bun.sleep(60);
    expect(process.closes).toBe(1);
    expect(warm.size).toBe(0);
});

test('changed launch facts keep a process holding background work for the same conversation', async () => {
    const warm = pool();
    const process = new FakeProcess();
    process.holdsBackgroundWork = true;
    await warm.park('agent-a', identity, process);
    expect(await warm.claim('agent-a', { ...identity, launchKey: 'launch-2' }, isFake)).toBe(
        process
    );
    expect(process.closes).toBe(0);
    // Another conversation or runtime is a deliberate reset: the background work ends with it.
    await warm.park('agent-a', identity, process);
    expect(
        await warm.claim('agent-a', { ...identity, nativeSessionId: 'conversation-2' }, isFake)
    ).toBeUndefined();
    expect(process.closes).toBe(1);
});

test('evict and close end a process even while it holds background work', async () => {
    const warm = pool();
    const a = new FakeProcess();
    const b = new FakeProcess();
    a.holdsBackgroundWork = true;
    b.holdsBackgroundWork = true;
    await warm.park('agent-a', identity, a);
    await warm.park('agent-b', identity, b);
    await warm.evict('agent-a');
    await warm.close();
    expect([a.closes, b.closes]).toEqual([1, 1]);
});

test('evict ends one Agent’s process; close ends all and refuses later parks', async () => {
    const warm = pool();
    const a = new FakeProcess();
    const b = new FakeProcess();
    await warm.park('agent-a', identity, a);
    await warm.park('agent-b', identity, b);
    await warm.evict('agent-a');
    expect([a.closes, b.closes]).toEqual([1, 0]);
    await warm.close();
    expect(b.closes).toBe(1);
    const late = new FakeProcess();
    await warm.park('agent-c', identity, late);
    expect(late.closes).toBe(1);
    expect(warm.size).toBe(0);
});
