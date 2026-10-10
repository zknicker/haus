import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useTaskLabels(serverId: string | undefined, options?: { enabled?: boolean }) {
    return hausTrpc.taskLabel.list.useQuery(
        { serverId: serverId ?? '' },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: serverId !== undefined && options?.enabled !== false,
        }
    );
}
