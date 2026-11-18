import type { ComputerUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import type { RealtimeServer } from './realtime-server.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `computer.onUpdated`: attachment, inventory, or update progress. It moves
 * the Server detail, the Computer list and log, Agent activity and delivery
 * (a detached Computer stops its Agents), usage, and the Cloud Agent model
 * catalog a report can carry.
 */
export function useComputerUpdateStream(server: RealtimeServer | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('computer.onUpdated', server?.id, () => {
        if (server) {
            applyComputerUpdate(coalescer, server, { computerId: null, serverId: server.id });
        }
    });

    const { reset } = hausTrpc.computer.onUpdated.useSubscription(
        { serverId: server?.id ?? '' },
        {
            enabled: server !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                if (server) {
                    applyComputerUpdate(coalescer, server, event);
                }
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyComputerUpdate(
    coalescer: TargetedReadCoalescer,
    server: RealtimeServer,
    { computerId, serverId }: ComputerUpdatedEvent
) {
    const invalidate = (queryKey: ReturnType<typeof getQueryKey>) =>
        coalescer.invalidate({ queryKey });
    invalidate(getQueryKey(hausTrpc.cloudAgentWork.listAutomations, { serverId }));
    invalidate(getQueryKey(hausTrpc.server.bySlug, { slug: server.slug }));
    invalidate(getQueryKey(hausTrpc.computer.list, { serverId }));
    invalidate(
        getQueryKey(
            hausTrpc.computer.systemLog,
            computerId ? { computerId, serverId } : { serverId }
        )
    );
    invalidate(getQueryKey(hausTrpc.agent.activeActivity, { serverId }));
    invalidate(getQueryKey(hausTrpc.agent.deliveryState, { serverId }));
    invalidate(getQueryKey(hausTrpc.agent.list, { serverId }));
    invalidate(getQueryKey(hausTrpc.stats.live, { serverId }));
    invalidate(getQueryKey(hausTrpc.cloudAgentSettings.get, { serverId }));
}
