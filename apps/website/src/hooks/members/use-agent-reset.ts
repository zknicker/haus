import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshAgentState } from './agent-refresh.ts';

export function useAgentReset(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.reset.useMutation({
        onSuccess: () => refreshAgentState(utils, serverId, agentId),
    });
    return {
        ...mutation,
        reset: (kind: 'full' | 'session') =>
            withSavingToast(() => mutation.mutateAsync({ agentId, kind, serverId }), {
                successNote:
                    kind === 'full'
                        ? 'The Captain will rebuild a minimal workspace with factory-managed skills.'
                        : 'The Captain will use fresh context on its next turn.',
            }),
    };
}
