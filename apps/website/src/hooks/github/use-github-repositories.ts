import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The repositories the connection's GitHub user can reach in one installation,
 * for the Trigger form's picker. The picker filters locally, so one read
 * serves every keystroke.
 */
export function useGithubRepositories(serverId: string, installationId: string | null) {
    return hausTrpc.github.repositories.useQuery(
        { installationId: installationId ?? '', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: installationId !== null, retry: false }
    );
}
