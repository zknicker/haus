import type { EffectRuntime } from '@haus/effect';
import type { AgentDelivery } from './agent-delivery/delivery.ts';
import { type DeliveryRetrySweep, startDeliveryRetrySweep } from './agent-delivery/retry-sweep.ts';
import type { ReminderClock } from './reminders/reminder-model.ts';
import {
    createReminderScheduler,
    type ReminderScheduler,
    type ReminderSchedulerHealth,
} from './reminders/reminder-scheduler.ts';

export interface ServerRecurringWork {
    close(): Promise<void>;
    reminderHealth(): ReminderSchedulerHealth;
}

interface RecurringWorkChildren<R> {
    createReminderScheduler(options: {
        clock: ReminderClock;
        runtime: EffectRuntime<R>;
        tick(): Promise<unknown>;
    }): Promise<ReminderScheduler>;
    startDeliveryRetrySweep(
        delivery: Pick<AgentDelivery, 'sweep'>,
        options: { runtime: EffectRuntime<R> }
    ): Promise<DeliveryRetrySweep>;
}

export interface ServerRecurringWorkOptions<R = never> {
    /** Focused child construction seam for lifecycle tests. */
    children?: RecurringWorkChildren<R>;
    delivery: Pick<AgentDelivery, 'sweep'>;
    reminderClock: ReminderClock;
    reminderTick: () => Promise<unknown>;
    runtime: EffectRuntime<R>;
}

export async function startServerRecurringWork<R>(
    options: ServerRecurringWorkOptions<R>
): Promise<ServerRecurringWork> {
    const children = options.children ?? defaultChildren;
    const retrySweep = await children.startDeliveryRetrySweep(options.delivery, {
        runtime: options.runtime,
    });
    let reminderScheduler: ReminderScheduler | null = null;
    try {
        reminderScheduler = await children.createReminderScheduler({
            clock: options.reminderClock,
            runtime: options.runtime,
            tick: options.reminderTick,
        });
        await reminderScheduler.start();
    } catch (cause) {
        try {
            await closeChildren(retrySweep, reminderScheduler);
        } catch (cleanupCause) {
            throw new AggregateError(
                [cause, cleanupCause],
                'Server recurring work startup and cleanup both failed.'
            );
        }
        throw cause;
    }

    let closePromise: Promise<void> | null = null;
    return {
        close() {
            closePromise ??= closeChildren(retrySweep, reminderScheduler);
            return closePromise;
        },
        reminderHealth: () => reminderScheduler.health(),
    };
}

async function closeChildren(
    retrySweep: DeliveryRetrySweep,
    reminderScheduler: ReminderScheduler | null
): Promise<void> {
    const results = await Promise.allSettled([
        retrySweep.close(),
        reminderScheduler?.close() ?? Promise.resolve(),
    ]);
    const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
    );
    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length > 1) {
        throw new AggregateError(failures, 'Server recurring work shutdown failed.');
    }
}

const defaultChildren = {
    createReminderScheduler,
    startDeliveryRetrySweep,
};
