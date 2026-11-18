import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** "Add existing installation": binds an owner-checked candidate to the connection. */
export function useGithubBindInstallation(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.github.bindInstallation.useMutation({
        onError: (error) =>
            toast.danger('Could not add the installation', { description: error.message }),
        onSuccess: async () =>
            await Promise.all([
                utils.github.installations.invalidate({ connectionId, serverId }),
                utils.github.installCandidates.invalidate({ connectionId, serverId }),
            ]),
    });

    return {
        ...mutation,
        bind: (githubInstallationId: number) =>
            mutation.mutate({ connectionId, githubInstallationId, serverId }),
    };
}
