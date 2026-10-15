import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Starts (or resumes) one Agent's guided identity flow: the Server creates the
 * `draft` identity and answers every value the Owner copies into Linear.
 */
export function useLinearIdentityDraft(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.linear.createIdentityDraft.useMutation({
        onSuccess: async () => await utils.linear.identities.invalidate({ connectionId, serverId }),
    });

    return {
        draft: mutation.data ?? null,
        error: mutation.error,
        isPending: mutation.isPending,
        prepare: (agentId: string) => mutation.mutate({ agentId, connectionId, serverId }),
        reset: mutation.reset,
    };
}
