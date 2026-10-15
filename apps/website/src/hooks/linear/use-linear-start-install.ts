import { hausTrpc } from '../../lib/haus-server.tsx';
import { openLinearAuthorize } from './open-linear-authorize.ts';

/**
 * "Connect Linear": installs the Haus app in a Linear workspace. With a
 * connection id it reconnects that connection's workspace instead.
 */
export function useLinearStartInstall(serverId: string, connectionId?: string) {
    const mutation = hausTrpc.linear.startInstall.useMutation();

    return {
        isPending: mutation.isPending,
        start: () =>
            openLinearAuthorize(
                () =>
                    mutation.mutateAsync(
                        connectionId === undefined ? { serverId } : { connectionId, serverId }
                    ),
                connectionId === undefined
                    ? 'Could not connect Linear'
                    : 'Could not reconnect Linear'
            ),
    };
}
