import { hausTrpc } from '../../lib/haus-server.tsx';
import { useProviderTab } from '../provider-return/use-provider-tab.ts';
import { openLinearAuthorize } from './open-linear-authorize.ts';

/**
 * "Connect Linear": installs the Haus app in a Linear workspace. With a
 * connection id it reconnects that connection's workspace instead.
 */
export function useLinearStartInstall(serverId: string, connectionId?: string) {
    const mutation = hausTrpc.linear.startInstall.useMutation();
    const beginTab = useProviderTab();

    return {
        isPending: mutation.isPending,
        start: () =>
            openLinearAuthorize(
                beginTab('Linear'),
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
