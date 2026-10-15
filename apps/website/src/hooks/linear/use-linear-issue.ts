import type { LinearIssueUrl } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useConnections } from '../servers/use-connections.ts';

/**
 * One issue chip's read, keyed by the normalized URL so two links to one issue
 * share it. Read only while the Server has a Linear connection; without one
 * the chip stays a plain link and asks nothing.
 */
export function useLinearIssue(serverId: string, issue: LinearIssueUrl) {
    const connections = useConnections(serverId);
    const hasLinear =
        connections.data?.some((connection) => connection.preset === 'linear') ?? false;
    const read = hausTrpc.linear.issue.useQuery(
        { serverId, url: issue.url },
        { ...queryPolicy.syncedSnapshot, enabled: hasLinear }
    );
    // Until the connection list loads, the link may still be an issue chip.
    return {
        data: read.data,
        enabled: connections.data === undefined || hasLinear,
        isError: read.isError,
    };
}
