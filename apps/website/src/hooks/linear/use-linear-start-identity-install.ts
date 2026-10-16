import { hausTrpc } from '../../lib/haus-server.tsx';
import { useProviderTab } from '../provider-return/use-provider-tab.ts';
import { openLinearAuthorize } from './open-linear-authorize.ts';

/** Installs one Agent's own Linear app; the callback binds it to the Agent. */
export function useLinearStartIdentityInstall(serverId: string) {
    const mutation = hausTrpc.linear.startIdentityInstall.useMutation();
    const beginTab = useProviderTab();

    return {
        isPending: mutation.isPending,
        start: (identityId: string) =>
            openLinearAuthorize(
                beginTab('Linear'),
                () => mutation.mutateAsync({ identityId, serverId }),
                'Could not start the install'
            ),
    };
}
