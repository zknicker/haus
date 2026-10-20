import type { LinearIssueUrl } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useConnectionChip } from '../servers/use-connection-chip.ts';
import { linearIssueRefetchInterval } from './linear-issue-refresh.ts';

/**
 * One issue chip's read, keyed by the normalized URL so two links to one issue
 * share it. Read only while the Server has a Linear connection; without one
 * the chip stays a plain link and asks nothing. A read with a thumbnail
 * rereads before its signed URL expires.
 */
export function useLinearIssue(serverId: string, issue: LinearIssueUrl) {
    const chip = useConnectionChip(serverId, 'linear-issue');
    const read = hausTrpc.linear.issue.useQuery(
        { serverId, url: issue.url },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: chip === 'available',
            refetchInterval: (query) => linearIssueRefetchInterval(query.state.data),
        }
    );
    return {
        data: read.data,
        enabled: chip !== 'absent',
        isError: read.isError,
    };
}
