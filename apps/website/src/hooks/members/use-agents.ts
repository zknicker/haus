import type { AgentAvailability } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One Agent's current availability from the Server's Agent list. A reader
 * re-renders only when that value changes, not on every list update.
 */
export function useAgentAvailability(serverId: string, agentId: string): AgentAvailability {
    const query = hausTrpc.agent.list.useQuery(
        { serverId },
        {
            ...queryPolicy.syncedSnapshot,
            select: (agents) => agents.find((agent) => agent.id === agentId)?.availability,
        }
    );
    return query.data ?? 'offline';
}

export function useAgents(serverId: string | undefined) {
    return hausTrpc.agent.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}
