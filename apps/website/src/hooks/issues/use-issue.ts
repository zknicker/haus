import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useIssue(serverId: string, issueId: string) {
    const { data, error } = hausTrpc.issue.get.useQuery(
        { issueId, serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error };
}
