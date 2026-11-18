import { keepPreviousData } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useComputerSystemLog(serverId: string, computerId: string, page: number) {
    return hausTrpc.computer.systemLog.useQuery(
        { computerId, page, serverId },
        { ...queryPolicy.syncedSnapshot, placeholderData: keepPreviousData }
    );
}
