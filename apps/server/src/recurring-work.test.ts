import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import type { DeliveryRetrySweep } from './agent-delivery/retry-sweep.ts';
import { startServerRecurringWork } from './recurring-work.ts';
import type { ReminderScheduler } from './reminders/reminder-scheduler.ts';

const now = new Date('2026-07-26T14:00:00.000Z');

test('partial startup closes the retry child when reminder construction fails', async () => {
    const runtime = makeTestRuntime();
    let retryCloseCalls = 0;
    await expect(
        startServerRecurringWork({
            children: {
                createReminderScheduler: async () => {
                    throw new Error('reminder startup failed');
                },
                startDeliveryRetrySweep: async () => ({
                    close: async () => {
                        retryCloseCalls += 1;
                    },
                }),
            },
            delivery: { sweep: async () => undefined },
            reminderClock: { now: () => now },
            reminderTick: async () => undefined,
            runtime,
        })
    ).rejects.toThrow('reminder startup failed');
    expect(retryCloseCalls).toBe(1);
    await runtime.dispose();
});

test('partial startup preserves both startup and cleanup failures', async () => {
    const runtime = makeTestRuntime();
    const startupFailure = new Error('reminder startup failed');
    const cleanupFailure = new Error('retry cleanup failed');
    try {
        await startServerRecurringWork({
            children: {
                createReminderScheduler: async () => {
                    throw startupFailure;
                },
                startDeliveryRetrySweep: async () => ({
                    close: async () => {
                        throw cleanupFailure;
                    },
                }),
            },
            delivery: { sweep: async () => undefined },
            reminderClock: { now: () => now },
            reminderTick: async () => undefined,
            runtime,
        });
        throw new Error('Expected recurring work startup to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([startupFailure, cleanupFailure]);
    } finally {
        await runtime.dispose();
    }
});

test('parent close shares one fence and joins both children', async () => {
    const runtime = makeTestRuntime();
    const retryCloseStarted = Promise.withResolvers<void>();
    const releaseRetryClose = Promise.withResolvers<void>();
    const reminderCloseStarted = Promise.withResolvers<void>();
    const releaseReminderClose = Promise.withResolvers<void>();
    const retrySweep: DeliveryRetrySweep = {
        close: async () => {
            retryCloseStarted.resolve();
            await releaseRetryClose.promise;
        },
    };
    const reminderScheduler = makeReminderScheduler({
        close: async () => {
            reminderCloseStarted.resolve();
            await releaseReminderClose.promise;
        },
    });
    const recurringWork = await startServerRecurringWork({
        children: {
            createReminderScheduler: async () => reminderScheduler,
            startDeliveryRetrySweep: async () => retrySweep,
        },
        delivery: { sweep: async () => undefined },
        reminderClock: { now: () => now },
        reminderTick: async () => undefined,
        runtime,
    });

    const firstClose = recurringWork.close();
    expect(recurringWork.close()).toBe(firstClose);
    await Promise.all([retryCloseStarted.promise, reminderCloseStarted.promise]);
    releaseRetryClose.resolve();
    releaseReminderClose.resolve();
    await firstClose;
    await runtime.dispose();
});

test('parent close preserves every child rejection after closing both', async () => {
    const runtime = makeTestRuntime();
    const retryFailure = new Error('retry close failed');
    const reminderFailure = new Error('reminder close failed');
    let reminderCloseCalls = 0;
    const recurringWork = await startServerRecurringWork({
        children: {
            createReminderScheduler: async () =>
                makeReminderScheduler({
                    close: async () => {
                        reminderCloseCalls += 1;
                        throw reminderFailure;
                    },
                }),
            startDeliveryRetrySweep: async () => ({
                close: async () => {
                    throw retryFailure;
                },
            }),
        },
        delivery: { sweep: async () => undefined },
        reminderClock: { now: () => now },
        reminderTick: async () => undefined,
        runtime,
    });

    const rejection = recurringWork.close();
    await expect(rejection).rejects.toBeInstanceOf(AggregateError);
    await rejection.catch((error: unknown) => {
        expect((error as AggregateError).errors).toEqual([retryFailure, reminderFailure]);
    });
    expect(reminderCloseCalls).toBe(1);
    await runtime.dispose();
});

test('default children use the shared runtime and run the immediate reminder tick', async () => {
    const runtime = makeTestRuntime();
    let reminderTicks = 0;
    const recurringWork = await startServerRecurringWork({
        delivery: { sweep: async () => undefined },
        reminderClock: { now: () => now },
        reminderTick: async () => {
            reminderTicks += 1;
        },
        runtime,
    });
    expect(reminderTicks).toBe(1);
    expect(recurringWork.reminderHealth().status).toBe('healthy');
    await recurringWork.close();
    await runtime.dispose();
});

function makeReminderScheduler(overrides: { close(): Promise<void> }): ReminderScheduler {
    return {
        close: overrides.close,
        health: () => ({
            consecutiveFailures: 0,
            lastSuccessfulTickAt: now.toISOString(),
            status: 'healthy',
        }),
        start: async () => undefined,
        wake: async () => undefined,
    };
}
