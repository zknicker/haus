import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useClaimAssignees(serverId: string, messageId: string, enabled: boolean) {
    return hausTrpc.claim.assignees.useQuery(
        { messageId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
}
