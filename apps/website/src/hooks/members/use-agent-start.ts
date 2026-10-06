import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { refreshAgentState } from './agent-refresh.ts';

export function useAgentStart(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.start.useMutation({
        onSuccess: () => refreshAgentState(utils, serverId, agentId),
    });
    return {
        ...mutation,
        start: () =>
            withSaveErrorToast(() => mutation.mutateAsync({ agentId, serverId })).catch(
                () => undefined
            ),
    };
}
