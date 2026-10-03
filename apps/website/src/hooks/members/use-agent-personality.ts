import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The Agent's private personality. Only Owners and Admins may read it, so callers enable the
 * query exactly when they could edit it; everyone else never asks.
 */
export function useAgentPersonality(serverId: string, agentId: string, enabled: boolean) {
    return hausTrpc.agent.personality.useQuery(
        { agentId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
}
