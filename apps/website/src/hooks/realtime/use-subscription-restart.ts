import * as React from 'react';
import { createSubscriptionRestart, type SubscriptionRestart } from './subscription-restart.ts';

/**
 * One long-lived subscription's restart policy (`createSubscriptionRestart`).
 * Wire `started` into the subscription's `onStarted` and pass `onError` errors
 * to `failed` with the subscription's `reset`:
 *
 *     const restart = useSubscriptionRestart('chat.onEvent', serverId);
 *     const { reset } = hausTrpc.chat.onEvent.useSubscription(input, {
 *         onError: (error) => restart.failed(error, reset),
 *         onStarted: () => { restart.started(); recover(); },
 *     });
 *
 * `key` names the subscription's input: a pending restart belongs to the input
 * that failed, so changing it (or unmounting) drops the restart.
 */
export function useSubscriptionRestart(stream: string, key: string | undefined) {
    const [restart] = React.useState<SubscriptionRestart>(() =>
        createSubscriptionRestart({
            cancel: (handle) => clearTimeout(handle),
            report: (message, error) => console.warn(message, error),
            schedule: (run, delayMs) => setTimeout(run, delayMs),
            stream,
        })
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the trigger; a new input owns no pending restart.
    React.useEffect(() => restart.dispose, [key, restart]);

    return restart;
}
