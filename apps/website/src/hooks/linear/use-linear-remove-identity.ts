import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** Removes one Agent's Linear identity; its open issues go back to the Haus app. */
export function useLinearRemoveIdentity(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.linear.removeIdentity.useMutation({
        onError: (error) =>
            toast.danger('Could not remove the Linear identity', { description: error.message }),
        onSuccess: async () => await utils.linear.identities.invalidate({ connectionId, serverId }),
    });

    return {
        isPending: mutation.isPending,
        remove: (identityId: string) => mutation.mutateAsync({ identityId, serverId }),
    };
}
