import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Unbound installations the connection's GitHub user owns. It reads GitHub
 * with the user token, so it runs only while the connection is signed in; a
 * refusal (no GitHub App, sign-in needed) simply offers nothing to add.
 */
export function useGithubInstallCandidates(
    serverId: string,
    connectionId: string,
    enabled: boolean
) {
    return hausTrpc.github.installCandidates.useQuery(
        { connectionId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled, retry: false }
    );
}
