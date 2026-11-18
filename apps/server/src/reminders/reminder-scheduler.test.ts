import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { createReminderScheduler } from './reminder-scheduler.ts';

const now = new Date('2026-07-26T14:00:00.000Z');

test('starts with one immediate tick and follows the Effect cadence', async () => {
    const runtime = makeTestRuntime();
    let ticks = 0;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            ticks += 1;
        },
    });
    try {
        await scheduler.start();
        expect(ticks).toBe(1);
        await runtime.runPromise(TestClock.adjust('14 seconds'));
        expect(ticks).toBe(1);
        await runtime.runPromise(TestClock.adjust('1 second'));
        expect(ticks).toBe(2);
        await runtime.runPromise(TestClock.adjust('15 seconds'));
        expect(ticks).toBe(3);
    } finally {
        await scheduler.close();
        await runtime.dispose();
    }
});

test('a slow startup tick does not shift the fixed-rate cadence', async () => {
    const runtime = makeTestRuntime();
    const firstTickStarted = Promise.withResolvers<void>();
    const releaseFirstTick = Promise.withResolvers<void>();
    let ticks = 0;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            ticks += 1;
            if (ticks === 1) {
                firstTickStarted.resolve();
                await releaseFirstTick.promise;
            }
        },
    });
    try {
        const starting = scheduler.start();
        await firstTickStarted.promise;
        await runtime.runPromise(TestClock.adjust('20 seconds'));
        expect(ticks).toBe(1);

        releaseFirstTick.resolve();
        await starting;
        await runtime.runPromise(TestClock.adjust('9 seconds'));
        expect(ticks).toBe(1);
        await runtime.runPromise(TestClock.adjust('1 second'));
        expect(ticks).toBe(2);
    } finally {
        await scheduler.close();
        await runtime.dispose();
    }
});

test('wake joins an active tick without queuing or overlapping another', async () => {
    const runtime = makeTestRuntime();
    const tickStarted = Promise.withResolvers<void>();
    const releaseTick = Promise.withResolvers<void>();
    let block = false;
    let active = 0;
    let maxActive = 0;
    let ticks = 0;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            ticks += 1;
            active += 1;
            maxActive = Math.max(maxActive, active);
            if (block) {
                tickStarted.resolve();
                await releaseTick.promise;
            }
            active -= 1;
        },
    });
    try {
        await scheduler.start();
        block = true;
        const firstWake = scheduler.wake();
        await tickStarted.promise;
        const joinedWake = scheduler.wake();
        expect(joinedWake).toBe(firstWake);
        expect(ticks).toBe(2);
        releaseTick.resolve();
        await Promise.all([firstWake, joinedWake]);
        expect(ticks).toBe(2);
        expect(maxActive).toBe(1);
    } finally {
        await scheduler.close();
        await runtime.dispose();
    }
});

test('failure degrades health and a later success restores it', async () => {
    const runtime = makeTestRuntime();
    let shouldFail = true;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            if (shouldFail) {
                throw new Error('database unavailable');
            }
        },
    });
    try {
        await expect(scheduler.start()).resolves.toBeUndefined();
        expect(scheduler.health()).toEqual({
            consecutiveFailures: 1,
            lastSuccessfulTickAt: null,
            status: 'degraded',
        });
        shouldFail = false;
        await scheduler.wake();
        expect(scheduler.health()).toEqual({
            consecutiveFailures: 0,
            lastSuccessfulTickAt: now.toISOString(),
            status: 'healthy',
        });
    } finally {
        await scheduler.close();
        await runtime.dispose();
    }
});

test('close shares one fence, joins an active tick, and fences new work', async () => {
    const runtime = makeTestRuntime();
    const tickStarted = Promise.withResolvers<void>();
    const releaseTick = Promise.withResolvers<void>();
    let block = false;
    let ticks = 0;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            ticks += 1;
            if (block) {
                tickStarted.resolve();
                await releaseTick.promise;
            }
        },
    });
    await scheduler.start();
    block = true;
    const waking = scheduler.wake();
    await tickStarted.promise;
    const firstClose = scheduler.close();
    expect(scheduler.close()).toBe(firstClose);
    const fencedWake = scheduler.wake();
    expect(fencedWake).toBe(waking);
    await runtime.runPromise(TestClock.adjust('1 hour'));
    expect(ticks).toBe(2);
    let closed = false;
    firstClose.then(() => {
        closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    releaseTick.resolve();
    await Promise.all([waking, fencedWake, firstClose]);
    expect(closed).toBe(true);
    expect(scheduler.health().status).toBe('stopped');
    await runtime.dispose();
});

test('does not start after graceful shutdown has begun', async () => {
    const runtime = makeTestRuntime();
    let ticks = 0;
    const scheduler = await createReminderScheduler({
        clock: { now: () => now },
        runtime,
        tick: async () => {
            ticks += 1;
        },
    });
    await scheduler.close();
    await scheduler.start();
    await runtime.runPromise(TestClock.adjust('1 hour'));
    expect(ticks).toBe(0);
    expect(scheduler.health().status).toBe('stopped');
    await runtime.dispose();
});
