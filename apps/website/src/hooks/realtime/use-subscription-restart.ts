import * as React from 'react';
import { useHausSessionRefresh } from '../../lib/haus-session-context.ts';
import { useServerLoss, useServerStreamsOpen } from '../servers/server-loss.ts';
import { createSubscriptionRestart, type SubscriptionRestart } from './subscription-restart.ts';

export interface StreamRestart {
    /** Wire to the subscription's `onComplete` with its `reset`. */
    completed: (reset: () => void) => void;
    /** Wire to the subscription's `onError` with its `reset`. */
    failed: (error: unknown, reset: () => void) => void;
    /** False once the Server was lost: AND it into the subscription's `enabled`. */
    open: boolean;
    /** Wire to `onStarted`. Runs `recover` when this start follows a failure or completion. */
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
 * `recover` refetches only the reads this stream owns; it runs on a restart
 * after a failure, never on the first start or a plain socket reconnect (the
 * App-wide reconnect pass owns those). `key` names the subscription's input:
 * changing it, or unmounting, drops a pending restart.
 */
export function useSubscriptionRestart(
    stream: string,
    serverId: string | undefined,
    recover?: () => void,
    key: string | undefined = serverId
): StreamRestart {
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
                if (restart.started()) {
                    latest.current.recover?.();
                }
            },
        }),
        [open, restart]
    );
}
