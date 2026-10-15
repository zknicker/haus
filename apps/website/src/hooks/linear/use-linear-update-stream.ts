import type { LinearUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';

/**
 * `linear.onUpdated`: one connection's workspace or Agent identities changed,
 * from the page's own actions, an install callback, a webhook, or a lifecycle
 * hook. The Server's workspace list and that connection's identities refetch.
 */
export function useLinearUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('linear.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.linear.workspaces, { serverId }),
            });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.linear.identities, { serverId }),
            });
        }
    });

    const { reset } = hausTrpc.linear.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyLinearUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyLinearUpdate(coalescer: TargetedReadCoalescer, event: LinearUpdatedEvent) {
    const { connectionId, serverId } = event;
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.linear.workspaces, { serverId }) });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.linear.identities, { connectionId, serverId }),
    });
}
