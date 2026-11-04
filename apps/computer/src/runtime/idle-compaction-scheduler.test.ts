import { expect, test } from 'bun:test';
import {
    type IdleCompactable,
    type IdleCompactionResult,
    type IdleCompactionSkip,
    type IdleCompactionSnapshot,
    ONE_HOUR_CACHE_MS,
} from './idle-compaction.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import { type WarmProcess, WarmProcessPool } from './warm-pool.ts';

class CompactableProcess implements WarmProcess, IdleCompactable {
    alive = true;
    closes = 0;
    compactions = 0;
    holdsBackgroundWork = false;
    snapshot: IdleCompactionSnapshot | null = {
        activityAt: Date.now(),
        cacheTtlMs: ONE_HOUR_CACHE_MS,
        contextTokens: 400_000,
        minTokens: 200_000,
        nearUsageLimit: false,
    };
    private readonly ended = Promise.withResolvers<void>();
    readonly exited = this.ended.promise;
    /** Resolve to finish the running compaction. */
    finish: ((result: IdleCompactionResult) => void) | null = null;

    close(): Promise<void> {
        this.closes += 1;
        this.alive = false;
        this.ended.resolve();
        return Promise.resolve();
    }

    compact(): Promise<IdleCompactionResult> {
        this.compactions += 1;
        const done = Promise.withResolvers<IdleCompactionResult>();
        this.finish = done.resolve;
        return done.promise;
    }

    idleCompactionSnapshot(): IdleCompactionSnapshot | null {
        return this.snapshot;
    }
}

const identity = {
    launchKey: 'launch-1',
    nativeSessionId: 'conversation-1',
    runtimeId: 'claude-code',
};
const isCompactable = (process: WarmProcess): process is CompactableProcess =>
    process instanceof CompactableProcess;
const result: IdleCompactionResult = {
    costUsd: 0.42,
    endedAt: new Date(),
    modelId: 'claude-haiku-5-5',
    startedAt: new Date(),
    summary: 'summary',
    tokensAfter: 30_000,
    tokensBefore: 400_000,
    usage: null,
};

function harness(options: { busy?: boolean; dueInMs?: number; idleMs?: number } = {}) {
    const reports: IdleCompactionResult[] = [];
    const skips: IdleCompactionSkip[] = [];
    const failures: unknown[] = [];
    let busy = options.busy ?? false;
    const hooks: IdleCompactionHooks = {
        busy: () => busy,
        compactable: (key) => !key.includes('#'),
        failed: (_key, error) => failures.push(error),
        report: (_key, _identity, compacted) => {
            reports.push(compacted);
            return Promise.resolve();
        },
        skipped: (_key, reason) => skips.push(reason),
    };
    const pool = new WarmProcessPool({
        idleCompaction: {
            // Due almost at once, so the test runs in milliseconds.
            dueAt: () => Date.now() + (options.dueInMs ?? 5),
            hooks,
        },
        idleMs: options.idleMs,
        onCloseError: (error) => {
            throw error;
        },
    });
    return {
        failures,
        pool,
        reports,
        setBusy: (next: boolean) => {
            busy = next;
        },
        skips,
    };
}

test('off by default: a parked session is never compacted until the Server setting is on', async () => {
    const { pool } = harness();
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(process.compactions).toBe(0);
});

test('with the setting on, a parked session compacts when due and the result is recorded', async () => {
    const { pool, reports } = harness();
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(process.compactions).toBe(1);
    process.finish?.(result);
    await Bun.sleep(0);
    expect(reports).toEqual([result]);
    // The process stays parked for the next turn.
    expect(await pool.claim('agent-a', identity, isCompactable)).toBe(process);
});

test('turning the setting on arms sessions already parked; turning it off cancels them', async () => {
    const { pool } = harness({ dueInMs: 15 });
    const parked = new CompactableProcess();
    await pool.park('agent-a', identity, parked);
    pool.setIdleCompaction(true);
    await Bun.sleep(30);
    expect(parked.compactions).toBe(1);

    const later = harness({ dueInMs: 15 });
    later.pool.setIdleCompaction(true);
    const cancelled = new CompactableProcess();
    await later.pool.park('agent-b', identity, cancelled);
    later.pool.setIdleCompaction(false);
    await Bun.sleep(30);
    expect(cancelled.compactions).toBe(0);
});

test('a session the next turn already claimed is not compacted', async () => {
    const { pool } = harness({ dueInMs: 15 });
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await pool.claim('agent-a', identity, isCompactable);
    await Bun.sleep(30);
    expect(process.compactions).toBe(0);
});

test('a busy Agent, live background work, or a newer request skips the compaction', async () => {
    const busy = harness({ busy: true });
    busy.pool.setIdleCompaction(true);
    const waiting = new CompactableProcess();
    await busy.pool.park('agent-a', identity, waiting);

    const background = harness();
    background.pool.setIdleCompaction(true);
    const working = new CompactableProcess();
    working.holdsBackgroundWork = true;
    await background.pool.park('agent-a', identity, working);

    const moved = harness({ dueInMs: 10 });
    moved.pool.setIdleCompaction(true);
    const active = new CompactableProcess();
    await moved.pool.park('agent-a', identity, active);
    active.snapshot = active.snapshot && { ...active.snapshot, activityAt: Date.now() + 1 };

    await Bun.sleep(30);
    expect([waiting.compactions, working.compactions, active.compactions]).toEqual([0, 0, 0]);
    expect(busy.skips).toEqual(['busy']);
    expect(background.skips).toEqual(['busy']);
    expect(moved.skips).toEqual(['newer-activity']);
});

test('a small context, a five-minute cache, or a throwaway session is never compacted', async () => {
    const { pool, skips } = harness();
    pool.setIdleCompaction(true);
    const small = new CompactableProcess();
    small.snapshot = small.snapshot && { ...small.snapshot, contextTokens: 50_000 };
    await pool.park('agent-a', identity, small);
    const shortCache = new CompactableProcess();
    shortCache.snapshot = shortCache.snapshot && { ...shortCache.snapshot, cacheTtlMs: 300_000 };
    const fiveMinutePool = new WarmProcessPool({
        idleCompaction: {
            hooks: {
                busy: () => false,
                compactable: () => true,
                failed: () => undefined,
                report: () => Promise.resolve(),
                skipped: (_key, reason) => skips.push(reason),
            },
        },
        onCloseError: () => undefined,
    });
    fiveMinutePool.setIdleCompaction(true);
    await fiveMinutePool.park('agent-b', identity, shortCache);
    const throwaway = new CompactableProcess();
    await pool.park('agent-c#heartbeat', identity, throwaway);
    await Bun.sleep(20);
    expect([small.compactions, shortCache.compactions, throwaway.compactions]).toEqual([0, 0, 0]);
    expect(skips).toEqual(['small-context']);
});

test('a compaction the idle close would cut is never armed', async () => {
    const { pool } = harness({ dueInMs: 50, idleMs: 20 });
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await Bun.sleep(70);
    expect(process.compactions).toBe(0);
    expect(process.closes).toBe(1);
});

test('a turn that arrives mid-compaction waits for it, then gets the compacted process', async () => {
    const { pool } = harness();
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(process.compactions).toBe(1);
    let claimed: CompactableProcess | undefined;
    const claim = pool.claim('agent-a', identity, isCompactable).then((taken) => {
        claimed = taken;
    });
    await Bun.sleep(10);
    expect(claimed).toBeUndefined();
    process.finish?.(result);
    await claim;
    expect(claimed).toBe(process);
    expect(process.closes).toBe(0);
});

test('the idle close waits for a running compaction instead of cutting it', async () => {
    const { pool, reports } = harness({ dueInMs: 5, idleMs: 30 });
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    await pool.park('agent-a', identity, process);
    await Bun.sleep(50);
    // The idle window passed mid-compaction: the process is still open.
    expect(process.compactions).toBe(1);
    expect(process.closes).toBe(0);
    process.finish?.(result);
    await Bun.sleep(10);
    expect(reports).toEqual([result]);
    expect(process.closes).toBe(1);
    expect(pool.size).toBe(0);
});

test('a failed compaction is reported and leaves the session parked', async () => {
    const { failures, pool } = harness();
    pool.setIdleCompaction(true);
    const process = new CompactableProcess();
    process.compact = () => {
        process.compactions += 1;
        return Promise.reject(new Error('refused'));
    };
    await pool.park('agent-a', identity, process);
    await Bun.sleep(20);
    expect(failures).toHaveLength(1);
    expect(await pool.claim('agent-a', identity, isCompactable)).toBe(process);
});
