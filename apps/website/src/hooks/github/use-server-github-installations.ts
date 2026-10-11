import type { GithubInstallation } from '@haus/api';
import { useQueries } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useConnections } from '../servers/use-connections.ts';

/**
 * Every installation bound to the Server's GitHub connections, for the Trigger
 * form. `data` stays undefined until the connection list and each
 * connection's installations have loaded, so callers can stay blank meanwhile.
 */
export function useServerGithubInstallations(serverId: string, enabled = true) {
    const utils = hausTrpc.useUtils();
    const connections = useConnections(serverId);
    const githubConnections = (connections.data ?? []).filter(
        (connection) => connection.preset === 'github'
    );
    const reads = useQueries({
        queries: githubConnections.map((connection) =>
            utils.github.installations.queryOptions(
                { connectionId: connection.id, serverId },
                { ...queryPolicy.syncedSnapshot, enabled }
            )
        ),
    });

    const loaded = connections.data !== undefined && reads.every((read) => read.data);
    const data: GithubInstallation[] | undefined = loaded
        ? reads.flatMap((read) => read.data ?? [])
        : undefined;
    return { data };
}
