import type { GithubInstallation, McpConnection } from '@haus/api';
import { useQueries } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useConnections } from '../servers/use-connections.ts';

export interface ServerGithubInstallations {
    /** The Server's GitHub connections, for each installation's sign-in and Agent grants. */
    connections: McpConnection[];
    installations: GithubInstallation[];
}

/**
 * Every installation bound to the Server's GitHub connections, for the Trigger
 * form. `data` stays undefined until the connection list and every
 * connection's installations have settled. A connection whose installations
 * fail to load leaves its installations out of `data` and reports `error`, so
 * the form shows the failure next to whatever did load instead of a silent
 * blank.
 */
export function useServerGithubInstallations(serverId: string) {
    const utils = hausTrpc.useUtils();
    const connections = useConnections(serverId);
    const githubConnections = (connections.data ?? []).filter(
        (connection) => connection.preset === 'github'
    );
    const reads = useQueries({
        queries: githubConnections.map((connection) =>
            utils.github.installations.queryOptions(
                { connectionId: connection.id, serverId },
                queryPolicy.syncedSnapshot
            )
        ),
    });

    const settled =
        connections.data !== undefined &&
        reads.every((read) => read.data !== undefined || read.error);
    const data: ServerGithubInstallations | undefined = settled
        ? {
              connections: githubConnections,
              installations: reads.flatMap((read) => read.data ?? []),
          }
        : undefined;
    const error = connections.error ?? reads.find((read) => read.error)?.error ?? null;
    return { data, error };
}
