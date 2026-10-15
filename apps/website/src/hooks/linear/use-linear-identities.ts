import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The Agent identities registered in one Linear connection's workspace. */
export function useLinearIdentities(serverId: string, connectionId: string) {
    return hausTrpc.linear.identities.useQuery(
        { connectionId, serverId },
        queryPolicy.syncedSnapshot
    );
}
