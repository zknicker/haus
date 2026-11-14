import { hausTrpc } from '../../lib/haus-server.tsx';
import { refreshAgent } from './agent-refresh.ts';

/**
 * Turns an Agent's connection admin role on or off (Owner/Admin only). The flag rides the Agent
 * record, so a save refreshes that record.
 */
export function useAgentConnectionAdmin(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.setConnectionAdmin.useMutation({
        onSuccess: () => refreshAgent(utils, serverId, agentId),
    });

    return {
        ...mutation,
        setConnectionAdmin: (connectionAdmin: boolean) =>
            mutation.mutate({ agentId, connectionAdmin, serverId }),
    };
}
