import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useTaskKeys(serverId: string) {
    const { data, error, isPending } = hausTrpc.taskKey.list.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error, isPending };
}
