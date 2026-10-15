import { hausTrpc } from '../../lib/haus-server.tsx';

/** Stores the client id and webhook signing secret the Owner pasted from Linear. */
export function useLinearSaveIdentityCredentials(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.linear.saveIdentityCredentials.useMutation({
        onSuccess: async () => await utils.linear.identities.invalidate({ connectionId, serverId }),
    });

    return {
        error: mutation.error,
        isPending: mutation.isPending,
        save: (input: { clientId: string; identityId: string; webhookSigningSecret: string }) =>
            mutation.mutate({ ...input, serverId }),
    };
}
