import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** One human's current Server profile. */
export function useMember(serverId: string, userId: string | undefined) {
    return hausTrpc.member.get.useQuery(
        { serverId, userId: userId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: userId !== undefined }
    );
}
