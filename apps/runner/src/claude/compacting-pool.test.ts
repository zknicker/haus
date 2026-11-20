import { expect, test } from 'bun:test';
import { dueMs, identity, minute, result, setup } from './compacting-pool.test-support.ts';

test('off by default: a parked session is never compacted until the Server setting is on', () => {
    const { newSession, pool, time } = setup();
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(60 * minute);
    expect(session.compactions).toBe(0);
});

test('with the setting on, a parked session compacts 54 minutes after its last request and the result is recorded', async () => {
    const { newSession, pool, reported, reports, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs - 1);
    expect(session.compactions).toBe(0);
    time.advance(1);
    expect(session.compactions).toBe(1);
    session.finish?.(result);
    await reported.current.promise;
    expect(reports).toEqual([result]);
    const claim = await pool.claim('agent-a', identity, time.now());
    expect(claim.process).toBe(session);
});

test('turning the setting on arms sessions already parked; turning it off cancels them', () => {
    const { newSession, pool, time } = setup();
    const parked = newSession();
    pool.park('agent-a', identity, parked, time.now());
    pool.setIdleCompaction(true);
    const cancelled = newSession();
    pool.park('agent-b', identity, cancelled, time.now());
    pool.setIdleCompaction(false);
    time.advance(dueMs);
    expect([parked.compactions, cancelled.compactions]).toEqual([0, 0]);

    const later = setup();
    const waiting = later.newSession();
    later.pool.park('agent-a', identity, waiting, later.time.now());
    later.pool.setIdleCompaction(true);
    later.time.advance(dueMs);
    expect(waiting.compactions).toBe(1);
});

test('a session the next turn already claimed is not compacted', async () => {
    const { newSession, pool, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    await pool.claim('agent-a', identity, time.now());
    time.advance(dueMs);
    expect(session.compactions).toBe(0);
});

test('a busy Agent, a newer request, a small context or a usage limit skips the compaction', () => {
    const busy = setup({ busy: true });
    busy.pool.setIdleCompaction(true);
    const waiting = busy.newSession();
    busy.pool.park('agent-a', identity, waiting, busy.time.now());
    busy.time.advance(dueMs);

    const moved = setup();
    moved.pool.setIdleCompaction(true);
    const active = moved.newSession();
    moved.pool.park('agent-a', identity, active, moved.time.now());
    active.snapshot = active.snapshot && { ...active.snapshot, activityAt: 1 };
    moved.time.advance(dueMs);

    const small = setup();
    small.pool.setIdleCompaction(true);
    const brief = small.newSession();
    small.pool.park('agent-a', identity, brief, small.time.now());
    brief.snapshot = brief.snapshot && { ...brief.snapshot, contextTokens: 50_000 };
    small.time.advance(dueMs);

    const limited = setup();
    limited.pool.setIdleCompaction(true);
    const near = limited.newSession();
    limited.pool.park('agent-a', identity, near, limited.time.now());
    near.snapshot = near.snapshot && { ...near.snapshot, nearUsageLimit: true };
    limited.time.advance(dueMs);

    expect([waiting, active, brief, near].map((session) => session.compactions)).toEqual([
        0, 0, 0, 0,
    ]);
    expect(busy.skips).toEqual(['busy']);
    expect(moved.skips).toEqual(['newer-activity']);
    expect(small.skips).toEqual(['small-context']);
    expect(limited.skips).toEqual(['usage-limit']);
});

test('a timer that fires more than a minute late, as after a sleeping machine, is skipped', () => {
    const { newSession, pool, skips, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs + 2 * minute);
    expect(session.compactions).toBe(0);
    expect(skips).toEqual(['late']);
});

test('a session with no one-hour cache, or one the idle close would reach first, is never armed', () => {
    const shortCache = setup();
    shortCache.pool.setIdleCompaction(true);
    const five = shortCache.newSession();
    five.snapshot = five.snapshot && { ...five.snapshot, cacheTtlMs: 5 * minute };
    shortCache.pool.park('agent-a', identity, five, shortCache.time.now());
    shortCache.time.advance(dueMs);

    const closing = setup({ idleMs: 10 * minute });
    closing.pool.setIdleCompaction(true);
    const early = closing.newSession();
    closing.pool.park('agent-a', identity, early, closing.time.now());
    closing.time.advance(dueMs);

    expect([five.compactions, early.compactions]).toEqual([0, 0]);
    expect([shortCache.skips, closing.skips]).toEqual([[], []]);
});

test('each Agent follows its own Server: only Agents of a Server with the setting on compact', () => {
    const { newSession, pool, time } = setup();
    const servers = new Map([
        ['agent-on', 'srv_on'],
        ['agent-off', 'srv_off'],
    ]);
    const enabled = new Set(['srv_on']);
    pool.setIdleCompaction((agentId) => enabled.has(servers.get(agentId) ?? ''));
    const on = newSession();
    const off = newSession();
    pool.park('agent-on', identity, on, time.now());
    pool.park('agent-off', identity, off, time.now());

    time.advance(dueMs);

    expect([on.compactions, off.compactions]).toEqual([1, 0]);
});
