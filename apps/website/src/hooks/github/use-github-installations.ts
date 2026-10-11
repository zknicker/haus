import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The installations bound to one GitHub connection, as its page lists them. */
export function useGithubInstallations(serverId: string, connectionId: string) {
    return hausTrpc.github.installations.useQuery(
        { connectionId, serverId },
        queryPolicy.syncedSnapshot
    );
}
