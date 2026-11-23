import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useRepos(serverId: string) {
    return hausTrpc.repo.list.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}
