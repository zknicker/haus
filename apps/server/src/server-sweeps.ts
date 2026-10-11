import { type EffectRuntime, settle } from '@haus/effect';
import { Effect, Scope } from 'effect';
import type { BootSweep, SweepTimers } from './boot-sweep.ts';
import type { GithubDelivery, GithubIngestOutcome } from './github/delivery-ingest.ts';
import { startGithubDeliveryRecovery } from './github/delivery-recovery.ts';
import type { GithubApp } from './github/github-app.ts';
import { startGithubInstallationSweep } from './github/installation-sweep.ts';
import type { HausDatabase } from './postgres/connection.ts';
import { startMessagePush } from './push/message-push.ts';
import type { PushSender } from './push/push-sender.ts';
import type { ReminderClock } from './reminders/reminder-model.ts';
import { startReminderRetentionSweep } from './reminders/retention-sweep.ts';
import { startStaleTaskSweep } from './tasks/close-stale-tasks.ts';
import { startTriggerRetentionSweep } from './triggers/retention-sweep.ts';

/** Production recovery cadence; the dev stack and tests pass their own. */
const githubRecoveryDefaultIntervalMs = 10 * 60_000;

interface ServerSweepsInput {
    /** The App origin iPhone push builds absolute avatar URLs against. */
    appOrigin: string;
    clock: ReminderClock;
    db: HausDatabase;
    /** The Haus GitHub App; its sweeps run only when configured. */
    githubApp: GithubApp | null;
    /** The ingest the webhook and delivery recovery share. */
    githubIngest(delivery: GithubDelivery): Promise<GithubIngestOutcome>;
    /** Delivery recovery cadence; `null` turns recovery off (the test harness). */
    githubRecoveryIntervalMs?: number | null;
    /** How long a push waits for its human to read the message elsewhere; tests shorten it. */
    pushReadGraceMs?: number;
    /** iPhone push; absent when no APNs key is configured. */
    pushSender: PushSender | null;
    timers?: SweepTimers;
    /** Wakes Agents whose GitHub Triggers entered a problem during a sweep. */
    wakeAgents?(wakes: { agentId: string; serverId: string }[]): void;
}

/**
 * Starts the Server's background listeners and boot sweeps inside the
 * application Scope, so each closes — waiting for work in flight — before the
 * database pool it writes to.
 */
export async function startServerSweeps(
    runtime: EffectRuntime<never>,
    scope: Scope.Scope,
    input: ServerSweepsInput
) {
    const { pushSender } = input;
    for (const start of [
        ...githubSweeps(runtime, input),
        () => startReminderRetentionSweep(input.db, input.clock, input.timers),
        () => startTriggerRetentionSweep(input.db, input.clock, input.timers),
        () => startStaleTaskSweep(input.db, input.clock, input.timers),
        ...(pushSender
            ? [
                  () =>
                      startMessagePush(input.db, pushSender, {
                          appOrigin: input.appOrigin,
                          readGraceMs: input.pushReadGraceMs,
                      }),
              ]
            : []),
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

/** The hourly installation sweep and the delivery recovery sweep. */
function githubSweeps(
    runtime: EffectRuntime<never>,
    input: ServerSweepsInput
): (() => BootSweep)[] {
    const { githubApp } = input;
    if (!githubApp) {
        return [];
    }
    const recoveryIntervalMs =
        input.githubRecoveryIntervalMs === undefined
            ? githubRecoveryDefaultIntervalMs
            : input.githubRecoveryIntervalMs;
    const installations = () =>
        startGithubInstallationSweep(
            { app: githubApp, clock: input.clock, db: input.db, wake: input.wakeAgents },
            input.timers
        );
    if (recoveryIntervalMs === null) {
        return [installations];
    }
    const recovery = () =>
        startGithubDeliveryRecovery(
            {
                app: githubApp,
                clock: { now: () => new Date() },
                db: input.db,
                ingest: input.githubIngest,
                runtime,
            },
            { intervalMs: recoveryIntervalMs, timers: input.timers }
        );
    return [installations, recovery];
}
