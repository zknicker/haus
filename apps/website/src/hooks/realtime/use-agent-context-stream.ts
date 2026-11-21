import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useAgentContextStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('agent.onContextUpdated', serverId, () => {
        if (serverId) {
            invalidateAgentContext(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.agent.onContextUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => invalidateAgentContext(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function invalidateAgentContext(
    coalescer: TargetedReadCoalescer,
    input: { agentId?: string; serverId: string }
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.agent.context, input) });
}
