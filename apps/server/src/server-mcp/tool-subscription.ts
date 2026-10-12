import { type EffectRuntime, settle } from '@haus/effect';
import type { Client } from '@modelcontextprotocol/client';
import { Data, Effect, type Scope } from 'effect';

class McpSubscriptionError extends Data.TaggedError('McpSubscriptionError')<{
    readonly cause: unknown;
}> {}

/** The client's Effect scope owns notification renewal and joins stream cleanup on retirement. */
export async function maintainToolSubscription(
    client: Client,
    signal: AbortSignal,
    refresh: () => Promise<void>,
    failed: (cause: unknown) => void,
    lifecycle: { runtime: EffectRuntime<never>; scope: Scope.CloseableScope }
): Promise<void> {
    let failures = 0;
    let initial = client.autoOpenedSubscription;
    const attempt = Effect.acquireUseRelease(
        Effect.tryPromise({
            try: async (requestSignal) => {
                const stream =
                    initial ??
                    (await client.listen(
                        { toolsListChanged: true },
                        {
                            signal: AbortSignal.any([signal, requestSignal]),
                            timeout: 5000,
                        }
                    ));
                initial = undefined;
                return stream;
            },
            catch: (cause) => new McpSubscriptionError({ cause }),
        }),
        (stream) =>
            Effect.tryPromise({
                try: async () => {
                    await refresh();
                    await stream.closed;
                },
                catch: (cause) => new McpSubscriptionError({ cause }),
            }),
        (stream) =>
            Effect.tryPromise({
                try: () => stream.close(),
                catch: (cause) => new McpSubscriptionError({ cause }),
            }).pipe(
                Effect.catchTag('McpSubscriptionError', (error) =>
                    Effect.sync(() => failed(error.cause))
                )
            )
    ).pipe(
        Effect.tap(() =>
            Effect.sync(() => {
                failures = 0;
            })
        ),
        Effect.catchTag('McpSubscriptionError', (error) =>
            Effect.sync(() => {
                failures += 1;
                failed(error.cause);
            })
        )
    );
    const loop = Effect.forever(
        attempt.pipe(
            Effect.andThen(
                Effect.suspend(() => Effect.sleep(Math.min(60_000, 5000 * 2 ** failures)))
            )
        )
    );
    await settle(lifecycle.runtime, Effect.forkIn(loop, lifecycle.scope));
}
