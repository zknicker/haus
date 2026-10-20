import { dreamRetentionPerAgent } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Every dream the Server keeps for this Agent, newest first, in one read the
 * hub and the Dreams section share. A dream run settling invalidates it from
 * the Server shell's lifecycle stream (`agent-history-cache.ts`).
 */
export function useAgentDreams(
    serverId: string,
    agentId: string,
    limit: number = dreamRetentionPerAgent
) {
    return hausTrpc.agent.dreams.useQuery(
        { agentId, limit, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: Boolean(serverId && agentId) }
    );
}

/** One dream with its patch; null when the Server has no record for that run. */
export function useAgentDream(serverId: string, agentId: string, runId: string | null) {
    return hausTrpc.agent.dream.useQuery(
        { agentId, runId: runId ?? 'run_missing', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: Boolean(serverId && agentId && runId) }
    );
}
