import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { Effect, TestClock } from 'effect';
import { startDeliveryRetrySweep } from './retry-sweep.ts';

test('retry sweep has no startup run and follows its two-second cadence', async () => {
    const runtime = makeTestRuntime();
    const delivery = {
        calls: 0,
        async sweep() {
            this.calls += 1;
        },
    };
    const retrySweep = await startDeliveryRetrySweep(delivery, { runtime });
    try {
        expect(delivery.calls).toBe(0);
        await runtime.runPromise(TestClock.adjust('1999 millis'));
        expect(delivery.calls).toBe(0);
        await runtime.runPromise(TestClock.adjust('1 millis'));
        expect(delivery.calls).toBe(1);
        await runtime.runPromise(TestClock.adjust('2 seconds'));
        expect(delivery.calls).toBe(2);
    } finally {
        await retrySweep.close();
        await runtime.dispose();
    }
});

test('retry sweep survives a failed attempt', async () => {
    const runtime = makeTestRuntime();
    let calls = 0;
    const retrySweep = await startDeliveryRetrySweep(
        {
            sweep: async () => {
                calls += 1;
                if (calls === 1) {
                    throw new Error('transient sweep failure');
                }
            },
        },
        { runtime }
    );
    try {
        await runtime.runPromise(TestClock.adjust('2 seconds'));
        expect(calls).toBe(1);
        await runtime.runPromise(TestClock.adjust('2 seconds'));
        expect(calls).toBe(2);
    } finally {
        await retrySweep.close();
        await runtime.dispose();
    }
});

test('slow sweeps retain the fixed-rate cadence', async () => {
    const runtime = makeTestRuntime();
    let calls = 0;
    const retrySweep = await startDeliveryRetrySweep(
        {
            sweep: async () => {
                calls += 1;
                await runtime.runPromise(Effect.sleep('1 second'));
            },
        },
        { runtime }
    );
    try {
        await runtime.runPromise(TestClock.adjust('7 seconds'));
        expect(calls).toBe(3);
        await runtime.runPromise(TestClock.adjust('1 second'));
    } finally {
        await retrySweep.close();
        await runtime.dispose();
    }
});

test('close shares one fence, joins an active sweep, and prevents overlap', async () => {
    const runtime = makeTestRuntime();
    const sweepStarted = Promise.withResolvers<void>();
    const releaseSweep = Promise.withResolvers<void>();
    let calls = 0;
    const retrySweep = await startDeliveryRetrySweep(
        {
            sweep: async () => {
                calls += 1;
                sweepStarted.resolve();
                await releaseSweep.promise;
            },
        },
        { runtime }
    );
    const advancing = runtime.runPromise(TestClock.adjust('10 seconds'));
    await sweepStarted.promise;
    expect(calls).toBe(1);

    const firstClose = retrySweep.close();
    expect(retrySweep.close()).toBe(firstClose);
    let closed = false;
    firstClose.then(() => {
        closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(calls).toBe(1);

    releaseSweep.resolve();
    await Promise.all([advancing, firstClose]);
    await runtime.runPromise(TestClock.adjust('1 hour'));
    expect(closed).toBe(true);
    expect(calls).toBe(1);
    await runtime.dispose();
});
