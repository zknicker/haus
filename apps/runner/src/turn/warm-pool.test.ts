import { expect, test } from 'bun:test';
import { WarmPool, warmIdleMs } from './warm-pool.ts';

const minute = 60_000;
const identity = (session: string) => ({ launchKey: 'launch-a', nativeSessionId: session });

test('parking past the cap evicts the least recently parked process first', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 2 });
    expect(pool.park('agent-1', identity('s1'), 'process-1', 0)).toEqual([]);
    expect(pool.park('agent-2', identity('s2'), 'process-2', minute)).toEqual([]);
    expect(pool.park('agent-1', identity('s1'), 'process-1', 2 * minute)).toEqual([]);
    expect(pool.park('agent-3', identity('s3'), 'process-3', 3 * minute)).toEqual(['process-2']);
    expect(pool.size).toBe(2);
});

test('evicting takes the least recently parked process, one at a time', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-1', 0);
    pool.park('agent-2', identity('s2'), 'process-2', minute);
    pool.park('agent-1', identity('s1'), 'process-1', 2 * minute);
    expect(pool.evictOldest()).toEqual(['process-2']);
    expect(pool.evictOldest()).toEqual(['process-1']);
    expect(pool.evictOldest()).toEqual([]);
});

test('a process parked for the full hour expires, one minute short of it is reused', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-1', 0);
    pool.park('agent-2', identity('s2'), 'process-2', 10 * minute);
    expect(pool.expire(60 * minute)).toEqual(['process-1']);
    expect(pool.claim('agent-2', identity('s2'), 69 * minute)).toEqual({
        closing: [],
        process: 'process-2',
    });
});

test('a claim with other launch facts or another session closes the parked process', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-1', 0);
    expect(pool.claim('agent-1', { launchKey: 'launch-b', nativeSessionId: 's1' }, minute)).toEqual(
        { closing: ['process-1'], process: undefined }
    );
    pool.park('agent-1', identity('s1'), 'process-1b', 2 * minute);
    expect(pool.claim('agent-1', identity('s2'), 3 * minute)).toEqual({
        closing: ['process-1b'],
        process: undefined,
    });
    expect(pool.claim('agent-1', identity('s1'), 4 * minute)).toEqual({
        closing: [],
        process: undefined,
    });
});

test('a claim past the idle window returns the stale process to close', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-1', 0);
    expect(pool.claim('agent-1', identity('s1'), 61 * minute)).toEqual({
        closing: ['process-1'],
        process: undefined,
    });
});

test('an Agent the pool is told to hold is skipped by expiry until it is released', () => {
    const held = new Set(['agent-1']);
    const pool = new WarmPool<string>({
        holds: (agentId) => held.has(agentId),
        idleMs: warmIdleMs,
        maxWarm: 16,
    });
    pool.park('agent-1', identity('s1'), 'process-1', 0);
    pool.park('agent-2', identity('s2'), 'process-2', 0);
    expect(pool.expire(60 * minute)).toEqual(['process-2']);
    held.clear();
    expect(pool.expire(60 * minute)).toEqual(['process-1']);
});

test('the pool reports which process is parked and when each would close', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-1', 5 * minute);
    expect(pool.isParked('agent-1', 'process-1')).toBe(true);
    expect(pool.isParked('agent-1', 'other')).toBe(false);
    expect(pool.closingTimes()).toEqual([['agent-1', 'process-1', 65 * minute]]);
});

test('parking a new process for the same Agent displaces the old one', () => {
    const pool = new WarmPool<string>({ idleMs: warmIdleMs, maxWarm: 16 });
    pool.park('agent-1', identity('s1'), 'process-old', 0);
    expect(pool.park('agent-1', identity('s1'), 'process-new', minute)).toEqual(['process-old']);
    expect(pool.drain()).toEqual(['process-new']);
});
