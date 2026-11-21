import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useComputerStewards(serverId: string, computerId: string) {
    return hausTrpc.computer.stewards.useQuery(
        { computerId, serverId },
        { ...queryPolicy.syncedSnapshot, retry: false }
    );
}
