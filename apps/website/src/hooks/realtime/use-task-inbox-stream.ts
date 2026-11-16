import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** Long enough for a filed queue's events to arrive together. */
export const hiddenWindowFlushMs = 250;

/**
 * `taskInbox.onChanged`, delivered only to the person whose items changed:
 * their item list. `onEvent` hears each live event (Task notifications); a
 * start's recovery read never reaches it.
 */
export function useTaskInboxStream(serverId: string | undefined, onEvent?: () => void) {
    const coalescer = useTargetedReadCoalescer();
    const latestOnEvent = React.useRef(onEvent);
    React.useLayoutEffect(() => {
        latestOnEvent.current = onEvent;
    });
    const invalidate = () => {
        if (serverId) {
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.taskInbox.list, { serverId }) });
        }
    };
    const stream = useSubscriptionRestart('taskInbox.onChanged', serverId, invalidate);

    const { reset } = hausTrpc.taskInbox.onChanged.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: () => {
                latestOnEvent.current?.();
                invalidate();
                // The coalescer flushes on a frame and a hidden window paints none, while
                // this read is what finds the assignment to notify about. The wait stands
                // in for that frame, so a burst of events still lands in one read.
                if (document.hidden) {
                    setTimeout(coalescer.flushInvalidations, hiddenWindowFlushMs);
                }
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}
