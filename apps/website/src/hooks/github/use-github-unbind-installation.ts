import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * "Remove from Haus": tombstones the installation, which puts its Triggers
 * into `installation_removed`, so the Trigger lists refresh with it.
 */
export function useGithubUnbindInstallation(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.github.unbindInstallation.useMutation({
        onError: (error) =>
            toast.danger('Could not remove the installation', { description: error.message }),
        onSuccess: async () =>
            await Promise.all([
                utils.github.installations.invalidate({ connectionId, serverId }),
                utils.github.installCandidates.invalidate({ connectionId, serverId }),
                // Every Agent's list on this Server: any of them may own a Trigger here.
                utils.trigger.list.invalidate({ serverId }),
            ]),
    });

    return {
        ...mutation,
        unbind: (installationId: string) => mutation.mutateAsync({ installationId, serverId }),
    };
}
