import { hausTrpc } from '../../lib/haus-server.tsx';
import { openLinearAuthorize } from './open-linear-authorize.ts';

/** Installs one Agent's own Linear app; the callback binds it to the Agent. */
export function useLinearStartIdentityInstall(serverId: string) {
    const mutation = hausTrpc.linear.startIdentityInstall.useMutation();

    return {
        isPending: mutation.isPending,
        start: (identityId: string) =>
            openLinearAuthorize(
                () => mutation.mutateAsync({ identityId, serverId }),
                'Could not start the install'
            ),
    };
}
