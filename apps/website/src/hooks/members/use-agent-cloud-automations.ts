import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useAgentCloudAutomations(serverId: string, agentId: string, history = false) {
    return hausTrpc.worker.listAutomations.useQuery(
        { agentId, history, serverId },
        queryPolicy.syncedSnapshot
    );
}
