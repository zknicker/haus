import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useAgentContext(serverId: string, agentId: string | null) {
    const query = hausTrpc.agent.context.useQuery(
        { agentId: agentId ?? '', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: agentId !== null }
    );
    return query.data?.snapshot ?? null;
}
