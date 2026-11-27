import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useCrewLifecycle(serverId: string, captainId: string | null) {
    return hausTrpc.task.crewLifecycle.useQuery(
        { captainId: captainId ?? '', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: captainId !== null }
    ).data;
}
