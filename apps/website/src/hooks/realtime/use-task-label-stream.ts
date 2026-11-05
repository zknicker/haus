import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `taskLabel.onUpdated`: the label catalog, the one read that carries a label. */
export function useTaskLabelStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('taskLabel.onUpdated', serverId, () => {
        if (serverId) {
            invalidateLabelCatalog(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.taskLabel.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => invalidateLabelCatalog(coalescer, event.serverId),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

function invalidateLabelCatalog(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.taskLabel.list, { serverId }) });
}
