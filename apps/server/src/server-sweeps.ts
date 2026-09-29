import { type EffectRuntime, settle } from '@haus/effect';
import { Effect, Scope } from 'effect';
import type { SweepTimers } from './boot-sweep.ts';
import type { HausDatabase } from './postgres/connection.ts';
import { startMessagePush } from './push/message-push.ts';
import type { PushSender } from './push/push-sender.ts';
import type { ReminderClock } from './reminders/reminder-model.ts';
import { startReminderRetentionSweep } from './reminders/retention-sweep.ts';
import { startStaleTaskSweep } from './tasks/close-stale-tasks.ts';
import { startTriggerRetentionSweep } from './triggers/retention-sweep.ts';

/**
 * Starts the Server's background listeners and boot sweeps inside the
 * application Scope, so each closes — waiting for work in flight — before the
 * database pool it writes to.
 */
export async function startServerSweeps(
    runtime: EffectRuntime<never>,
    scope: Scope.Scope,
    input: {
        clock: ReminderClock;
        db: HausDatabase;
        /** iPhone push; absent when no APNs key is configured. */
        pushSender: PushSender | null;
        timers?: SweepTimers;
    }
) {
    const { pushSender } = input;
    for (const start of [
        () => startReminderRetentionSweep(input.db, input.clock, input.timers),
        () => startTriggerRetentionSweep(input.db, input.clock, input.timers),
        () => startStaleTaskSweep(input.db, input.clock, input.timers),
        ...(pushSender ? [() => startMessagePush(input.db, pushSender)] : []),
    ]) {
        await settle(
            runtime,
            Scope.extend(
                Effect.acquireRelease(Effect.sync(start), (started) =>
                    Effect.promise(() => started.close())
                ),
                scope
            )
        );
    }
}
