import { useQuery } from '@tanstack/react-query';
import { readLocalComputerId } from '../../lib/desktop-repo-folder.ts';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useLocalComputerId(serverId: string) {
    return useQuery({
        ...queryPolicy.localConfig,
        queryFn: () => readLocalComputerId(serverId),
        queryKey: ['desktop', 'local-computer-id', serverId],
    }).data;
}
