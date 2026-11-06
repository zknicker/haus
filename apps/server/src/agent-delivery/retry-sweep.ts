import { type EffectRuntime, instrumentOperation, settle } from '@haus/effect';
import { Data, Effect, Exit, Schedule, Scope } from 'effect';
import type { AgentDelivery } from './delivery.ts';
import { DeliverySweepError } from './dispatch-each.ts';

const sweepInterval = '2 seconds';

export interface DeliveryRetrySweep {
    close(): Promise<void>;
}

export interface DeliveryRetrySweepOptions<R> {
    runtime: EffectRuntime<R>;
}

class DeliveryRetrySweepError extends Data.TaggedError('DeliveryRetrySweepError')<{
    readonly cause: unknown;
}> {}

/**
 * Periodically resends unacknowledged deliveries and drains any pending inbox
 * left behind an offline Computer. Reconnect handles the common case; this sweep
 * covers a Computer that stays attached but dropped a start frame, and re-drives
 * work that could not dispatch while its Computer was offline.
 */
export async function startDeliveryRetrySweep<R>(
    delivery: Pick<AgentDelivery, 'sweep'>,
    options: DeliveryRetrySweepOptions<R>
): Promise<DeliveryRetrySweep> {
    const scope = await settle(options.runtime, Scope.make());
    let closing = false;
    let closePromise: Promise<void> | null = null;

    const sweep = Effect.fnUntraced(function* () {
        if (closing) {
            return;
        }
        yield* Effect.tryPromise({
            catch: (cause) => new DeliveryRetrySweepError({ cause }),
            try: () => delivery.sweep(),
        }).pipe(
            (effect) => instrumentOperation(effect, 'delivery.retry-sweep'),
            Effect.catchTag('DeliveryRetrySweepError', (error) =>
                Effect.logWarning('Delivery retry sweep failed; the next sweep will retry.').pipe(
                    Effect.annotateLogs({
                        failureKind: failureKind(error.cause),
                        operation: 'delivery.retry-sweep',
                        ...(error.cause instanceof DeliverySweepError
                            ? { failures: error.cause.failures }
                            : {}),
                    })
                )
            )
        );
    });

    const loop = Effect.sleep(sweepInterval).pipe(
        Effect.zipRight(
            sweep().pipe(Effect.uninterruptible, Effect.repeat(Schedule.fixed(sweepInterval)))
        ),
        Effect.asVoid
    );
    await settle(options.runtime, Effect.forkIn(loop, scope));

    return {
        close() {
            if (closePromise) {
                return closePromise;
            }
            closing = true;
            closePromise = settle(options.runtime, Scope.close(scope, Exit.succeed(undefined)));
            return closePromise;
        },
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
