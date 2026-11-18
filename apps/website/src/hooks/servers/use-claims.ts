import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The Server's claims in the default lens, which hides background-tier claims. */
export function useClaims(serverId: string | undefined) {
    return hausTrpc.claim.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}
