import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useProjectUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('project.onUpdated', serverId, () => {
        if (serverId) {
            invalidateProjects(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.project.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => invalidateProjects(coalescer, event.serverId),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

function invalidateProjects(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.project.list, { serverId }) });
}
