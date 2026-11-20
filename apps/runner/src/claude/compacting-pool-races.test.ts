import { expect, test } from 'bun:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { dueMs, identity, minute, result, setup } from './compacting-pool.test-support.ts';

test('a turn that arrives mid-compaction waits for it, then gets the compacted process', async () => {
    const { events, newSession, pool, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    expect(session.compactions).toBe(1);
    const claim = pool.claim('agent-a', identity, time.now()).then((taken) => {
        events.push('claimed');
        return taken;
    });
    await nextTurn();
    expect(events).toEqual([]);
    session.finish?.(result);
    expect((await claim).process).toBe(session);
    expect((await claim).closing).toEqual([]);
});

test('the compaction is not over for a turn until its delivery receipts are reset', async () => {
    const { events, newSession, pool, receipts, time } = setup();
    const reset = Promise.withResolvers<void>();
    receipts.current = reset.promise;
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    const claim = pool.claim('agent-a', identity, time.now()).then(() => events.push('claimed'));
    session.finish?.(result);
    await nextTurn();
    expect(events).toEqual([]);
    reset.resolve();
    await claim;
    expect(events).toEqual(['claimed']);
});

test('a reconnect mid-compaction never fires a second one; it re-arms once the first settles', async () => {
    const { newSession, pool, reported, time } = setup({ idleMs: 240 * minute });
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    expect(session.compactions).toBe(1);
    const first = session.finish;
    pool.setIdleCompaction(true);
    time.advance(dueMs);
    expect(session.compactions).toBe(1);
    session.snapshot = session.snapshot && { ...session.snapshot, activityAt: time.now() };
    first?.(result);
    await reported.current.promise;
    await nextTurn();
    time.advance(dueMs);
    expect(session.compactions).toBe(2);
});

test('the idle close skips a session that is compacting and takes it once it finished', async () => {
    const { newSession, pool, reported, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    expect(pool.expire(60 * minute)).toEqual([]);
    expect(pool.size).toBe(1);
    session.finish?.(result);
    await reported.current.promise;
    await nextTurn();
    expect(pool.expire(60 * minute)).toEqual([session]);
    expect(pool.size).toBe(0);
});

test('a failed compaction is reported and leaves the session parked', async () => {
    const { failures, newSession, pool, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    session.fail?.(new Error('refused'));
    const claim = await pool.claim('agent-a', identity, time.now());
    expect(failures).toHaveLength(1);
    expect(claim.process).toBe(session);
});

test('a session the pool evicted or an Agent reset took is never compacted', () => {
    const { newSession, pool, time } = setup({ maxWarm: 1 });
    pool.setIdleCompaction(true);
    const evicted = newSession();
    const kept = newSession();
    const taken = newSession();
    pool.park('agent-a', identity, evicted, time.now());
    expect(pool.park('agent-b', identity, kept, time.now())).toEqual([evicted]);
    pool.take('agent-b');
    pool.park('agent-c', identity, taken, time.now());
    time.advance(dueMs);
    expect([evicted.compactions, kept.compactions]).toEqual([0, 0]);
    expect(taken.compactions).toBe(1);
});

test('draining the pool at shutdown cancels every armed compaction', () => {
    const { newSession, pool, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    expect(pool.drain()).toEqual([session]);
    time.advance(dueMs);
    expect(session.compactions).toBe(0);
});
