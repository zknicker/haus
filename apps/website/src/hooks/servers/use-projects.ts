import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useProjects(serverId: string, options: { enabled?: boolean } = {}) {
    return hausTrpc.project.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled: options.enabled }
    );
}
