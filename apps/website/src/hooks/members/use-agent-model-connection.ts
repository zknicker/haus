import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { refreshAgent } from './agent-refresh.ts';

export function useAgentModelConnection(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.modelConnections.assignAgent.useMutation({
        onSuccess: () => refreshAgent(utils, serverId, agentId),
    });

    return {
        ...mutation,
        assign: (connectionId: string | null) =>
            withSaveErrorToast(() =>
                mutation.mutateAsync({ agentId, connectionId, serverId })
            ).catch(() => undefined),
    };
}
