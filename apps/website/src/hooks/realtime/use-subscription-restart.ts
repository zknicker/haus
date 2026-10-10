import * as React from 'react';
import { useHausSessionRefresh } from '../../lib/haus-session-context.ts';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { useServerLoss, useServerStreamsOpen } from '../servers/server-loss.ts';
import { createSubscriptionRestart, type SubscriptionRestart } from './subscription-restart.ts';

export interface StreamRestart {
    /** Wire to the subscription's `onComplete` with its `reset`. */
    completed: (reset: () => void) => void;
    /** Wire to the subscription's `onError` with its `reset`. */
    failed: (error: unknown, reset: () => void) => void;
    /** False once the Server was lost: AND it into the subscription's `enabled`. */
    open: boolean;
    /** Wire to `onStarted`. Reconciles the stream's owned reads on every start. */
    started: () => void;
}

/**
 * One Server-rooted subscription's restart policy (`createSubscriptionRestart`):
 *
 *     const stream = useSubscriptionRestart('chat.onRead', serverId, recover);
 *     const { reset } = hausTrpc.chat.onRead.useSubscription(input, {
 *         enabled: serverId !== undefined && stream.open,
 *         onComplete: () => stream.completed(reset),
 *         onError: (error) => stream.failed(error, reset),
 *         onStarted: stream.started,
 *     });
 *
 * `recover` names the reads this stream owns. It runs through the coalescer's
 * start reconciliation after every successful start: the first, a resubscribe
 * after a socket reconnect, and a restart after a failure. Only reads fetched
 * before the start refetch (`lib/start-reconciliation.ts`); there is no
 * App-wide reconnect pass. `key` names the subscription's input: changing it,
 * or unmounting, drops a pending restart.
 */
export function useSubscriptionRestart(
    stream: string,
    serverId: string | undefined,
    recover?: () => void,
    key: string | undefined = serverId
): StreamRestart {
    const coalescer = useTargetedReadCoalescer();
    const loseServer = useServerLoss();
    const refreshSession = useHausSessionRefresh();
    const open = useServerStreamsOpen(serverId);
    const latest = React.useRef({ loseServer, recover, refreshSession, serverId });
    React.useLayoutEffect(() => {
        latest.current = { loseServer, recover, refreshSession, serverId };
    });
    const [restart] = React.useState<SubscriptionRestart>(() =>
        createSubscriptionRestart({
            cancel: (handle) => clearTimeout(handle),
            onMembershipLost: () => {
                const lost = latest.current.serverId;
                if (lost !== undefined) {
                    latest.current.loseServer(lost);
                }
            },
            refreshSession: () => latest.current.refreshSession(),
            report: (message, error) => console.warn(message, error ?? ''),
            schedule: (run, delayMs) => setTimeout(run, delayMs),
            stream,
        })
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the trigger; a new input owns no pending restart.
    React.useEffect(() => restart.dispose, [key, restart]);

    return React.useMemo(
        () => ({
            completed: (reset) => restart.completed(reset),
            failed: (error, reset) => restart.failed(error, reset),
            open,
            started: () => {
                restart.started();
                const { recover } = latest.current;
                if (recover) {
                    coalescer.reconcileStart(recover);
                }
            },
        }),
        [coalescer, open, restart]
    );
}
