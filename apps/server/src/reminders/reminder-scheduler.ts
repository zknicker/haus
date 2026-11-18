import { type EffectRuntime, instrumentOperation, settle } from '@haus/effect';
import { Data, Deferred, type Duration, Effect, Exit, Ref, Schedule, Scope } from 'effect';
import type { ReminderClock } from './reminder-model.ts';

const defaultInterval = '15 seconds';

export interface ReminderSchedulerHealth {
    consecutiveFailures: number;
    lastSuccessfulTickAt: string | null;
    status: 'degraded' | 'healthy' | 'stopped';
}

export interface ReminderScheduler {
    close(): Promise<void>;
    health(): ReminderSchedulerHealth;
    start(): Promise<void>;
    wake(): Promise<void>;
}

export interface ReminderSchedulerOptions<R> {
    clock: ReminderClock;
    interval?: Duration.DurationInput;
    runtime: EffectRuntime<R>;
    tick(): Promise<unknown>;
}

class ReminderTickError extends Data.TaggedError('ReminderTickError')<{
    readonly cause: unknown;
}> {}

type TickState =
    | { readonly kind: 'idle' }
    | { readonly completion: Deferred.Deferred<void>; readonly kind: 'running' };

type TickSelection =
    | { readonly completion: Deferred.Deferred<void>; readonly owner: false }
    | { readonly completion: Deferred.Deferred<void>; readonly owner: true };

export async function createReminderScheduler<R>(
    options: ReminderSchedulerOptions<R>
): Promise<ReminderScheduler> {
    const scope = await settle(options.runtime, Scope.make());
    const tickState = await settle(options.runtime, Ref.make<TickState>({ kind: 'idle' }));
    let closing = false;
    let closePromise: Promise<void> | null = null;
    let consecutiveFailures = 0;
    let inFlightWake: Promise<void> | null = null;
    let lastSuccessfulTickAt: string | null = null;
    let started = false;

    const performTick = Effect.fnUntraced(function* () {
        yield* Effect.tryPromise({
            catch: (cause) => new ReminderTickError({ cause }),
            try: () => options.tick(),
        }).pipe(
            Effect.tap(() =>
                Effect.sync(() => {
                    consecutiveFailures = 0;
                    lastSuccessfulTickAt = options.clock.now().toISOString();
                })
            ),
            (effect) => instrumentOperation(effect, 'reminder.tick'),
            Effect.catchTag('ReminderTickError', (error) =>
                Effect.sync(() => {
                    consecutiveFailures += 1;
                }).pipe(
                    Effect.zipRight(
                        Effect.logWarning('Reminder tick failed; the scheduler will retry.').pipe(
                            Effect.annotateLogs({
                                failureKind: failureKind(error.cause),
                                operation: 'reminder.tick',
                            })
                        )
                    )
                )
            )
        );
    });

    const selectTick = Effect.fnUntraced(function* () {
        const candidate = yield* Deferred.make<void>();
        const selected = yield* Ref.modify<TickState, TickSelection>(tickState, (current) => {
            if (current.kind === 'running') {
                return [{ completion: current.completion, owner: false } as const, current];
            }
            return [
                { completion: candidate, owner: true } as const,
                { completion: candidate, kind: 'running' } as const,
            ];
        });
        return selected;
    });

    const runOwnedTick = (completion: Deferred.Deferred<void>) =>
        performTick().pipe(
            Effect.ensuring(
                Deferred.succeed(completion, undefined).pipe(
                    Effect.zipRight(Ref.set(tickState, { kind: 'idle' }))
                )
            ),
            Effect.uninterruptible
        );

    const joinOrRunTick = Effect.fnUntraced(function* () {
        const selected = yield* selectTick();
        if (!selected.owner) {
            return yield* Deferred.await(selected.completion);
        }
        return yield* runOwnedTick(selected.completion);
    });

    const startScheduledTick = Effect.fnUntraced(function* () {
        const selected = yield* selectTick();
        if (selected.owner) {
            yield* Effect.forkIn(runOwnedTick(selected.completion), scope);
        }
    });

    const wake = () => {
        if (inFlightWake) {
            return inFlightWake;
        }
        if (closing) {
            return Promise.resolve();
        }
        inFlightWake = settle(options.runtime, joinOrRunTick())
            .then(() => undefined)
            .finally(() => {
                inFlightWake = null;
            });
        return inFlightWake;
    };

    return {
        close() {
            if (closePromise) {
                return closePromise;
            }
            closing = true;
            const acceptedWake = inFlightWake ?? Promise.resolve();
            closePromise = Promise.allSettled([
                settle(options.runtime, Scope.close(scope, Exit.succeed(undefined))),
                acceptedWake,
            ]).then(([scopeResult, wakeResult]) => {
                if (scopeResult.status === 'rejected') {
                    throw scopeResult.reason;
                }
                if (wakeResult.status === 'rejected') {
                    throw wakeResult.reason;
                }
            });
            return closePromise;
        },
        health() {
            return {
                consecutiveFailures,
                lastSuccessfulTickAt,
                status:
                    closing || !started
                        ? ('stopped' as const)
                        : consecutiveFailures === 0
                          ? ('healthy' as const)
                          : ('degraded' as const),
            };
        },
        async start() {
            if (started || closing) {
                return;
            }
            started = true;
            const interval = options.interval ?? defaultInterval;
            const loop = Effect.sleep(interval).pipe(
                Effect.zipRight(startScheduledTick().pipe(Effect.repeat(Schedule.fixed(interval)))),
                Effect.asVoid
            );
            await settle(options.runtime, Effect.forkIn(loop, scope));
            await wake();
        },
        wake,
    };
}

function failureKind(cause: unknown): string {
    if (cause instanceof Error) {
        return cause.name;
    }
    if (typeof cause === 'object' && cause !== null && '_tag' in cause) {
        return typeof cause._tag === 'string' ? cause._tag : 'object';
    }
    return typeof cause;
}
