import type { AgentUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import type { RealtimeServer } from './realtime-server.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `agent.onUpdated`: an Agent's configuration, profile, delivery control,
 * skills, or workspace files, or the roster. A named Agent refreshes its own
 * reads; a null id refreshes every Agent read of the Server.
 */
export function useAgentUpdateStream(server: RealtimeServer | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('agent.onUpdated', server?.id, () => {
        if (server) {
            applyAgentUpdate(coalescer, server, { agentId: null, serverId: server.id });
        }
    });

    const { reset } = hausTrpc.agent.onUpdated.useSubscription(
        { serverId: server?.id ?? '' },
        {
            enabled: server !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => {
                if (server) {
                    applyAgentUpdate(coalescer, server, event);
                }
            },
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyAgentUpdate(
    coalescer: TargetedReadCoalescer,
    server: RealtimeServer,
    { agentId, serverId }: AgentUpdatedEvent
) {
    const scope = agentId ? { agentId, serverId } : { serverId };
    const invalidate = (queryKey: ReturnType<typeof getQueryKey>) =>
        coalescer.invalidate({ queryKey });
    invalidate(getQueryKey(hausTrpc.cloudAgentWork.listAutomations, { serverId }));
    invalidate(getQueryKey(hausTrpc.server.bySlug, { slug: server.slug }));
    invalidate(getQueryKey(hausTrpc.agent.get, scope));
    if (agentId) {
        invalidate(getQueryKey(hausTrpc.agent.deliveryState, scope));
    }
    invalidate(getQueryKey(hausTrpc.agent.conversationStyle, scope));
    invalidate(getQueryKey(hausTrpc.agent.skillFile, scope));
    invalidate(getQueryKey(hausTrpc.agent.workspaceFile, scope));
    invalidate(getQueryKey(hausTrpc.agent.workspaceFiles, scope));
    invalidate(getQueryKey(hausTrpc.agent.list, { serverId }));
    invalidate(getQueryKey(hausTrpc.chat.list, { serverId }));
}
