import { expect, test } from 'bun:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { dueMs, identity, result, setup } from './compacting-pool.test-support.ts';

test('a claim waiting behind a compaction gives up when its run is stopped, and the session stays parked', async () => {
    const { newSession, pool, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    const stop = new AbortController();
    const outcome = pool.claim('agent-a', identity, time.now(), stop.signal).then(
        () => 'claimed',
        (error: unknown) => error
    );
    await nextTurn();
    stop.abort(new Error('stopped'));
    expect(await outcome).toEqual(new Error('stopped'));
    expect(pool.size).toBe(1);
    session.finish?.(result);
    expect((await pool.claim('agent-a', identity, time.now())).process).toBe(session);
});

test('a claim whose run was already stopped neither waits nor takes the session', async () => {
    const { newSession, pool, time } = setup();
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    const stop = new AbortController();
    stop.abort(new Error('stopped'));
    await expect(pool.claim('agent-a', identity, time.now(), stop.signal)).rejects.toThrow(
        'stopped'
    );
    expect(pool.size).toBe(1);
});

test('a failed receipt reset is reported and still releases the waiting claim', async () => {
    const { events, failures, newSession, pool, receipts, time } = setup();
    const reset = Promise.withResolvers<void>();
    receipts.current = reset.promise;
    pool.setIdleCompaction(true);
    const session = newSession();
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    const claim = pool.claim('agent-a', identity, time.now()).then((taken) => {
        events.push('claimed');
        return taken;
    });
    session.finish?.(result);
    await nextTurn();
    expect(events).toEqual([]);
    reset.reject(new Error('disk full'));
    expect((await claim).process).toBe(session);
    expect(failures).toHaveLength(1);
});

test('a session holding background work is never compacted', () => {
    const { newSession, pool, skips, time } = setup();
    pool.setIdleCompaction(true);
    const session = newSession();
    session.holdsBackgroundWork = true;
    pool.park('agent-a', identity, session, time.now());
    time.advance(dueMs);
    expect(session.compactions).toBe(0);
    expect(skips).toEqual(['busy']);
});
