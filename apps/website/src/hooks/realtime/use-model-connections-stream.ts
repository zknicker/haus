import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useModelConnectionsStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('modelConnections.onUpdated', serverId, () => {
        if (serverId) {
            applyModelConnectionsUpdate(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.modelConnections.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyModelConnectionsUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyModelConnectionsUpdate(
    coalescer: TargetedReadCoalescer,
    { serverId }: { serverId: string }
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.modelConnections.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.modelConnections.signIn, { serverId }) });
}
