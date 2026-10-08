import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One Agent's token ledger (`stats.agentUsage`), for its profile tile: the
 * Server reads only this Agent's rows. A run settling refreshes it from the
 * Server shell's lifecycle stream (`agent-history-cache.ts`).
 */
export function useAgentUsage(serverId: string, agentId: string) {
    return hausTrpc.stats.agentUsage.useQuery(
        { agentId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: Boolean(serverId && agentId) }
    );
}
