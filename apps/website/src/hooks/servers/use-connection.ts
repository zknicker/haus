import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One MCP connection, read from the Server's connection list so the page, the
 * breadcrumb, and the Connections list share one cache entry. `null` once the
 * list has loaded without it — removed, or never on this Server.
 */
export function useConnection(serverId: string, connectionId: string | undefined) {
    return hausTrpc.mcp.list.useQuery(
        { serverId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: connectionId !== undefined,
            select: (connections) =>
                connections.find((connection) => connection.id === connectionId) ?? null,
        }
    );
}
