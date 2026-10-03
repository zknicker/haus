import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshAgent } from './agent-refresh.ts';

export interface AgentIdentityDraft {
    description: string;
    displayName: string;
    /** Absent leaves the stored personality unchanged; blank clears it. */
    personality?: string;
}

export function useAgentIdentity(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.updateProfile.useMutation({
        onSuccess: () =>
            Promise.all([
                refreshAgent(utils, serverId, agentId),
                utils.agent.personality.invalidate({ agentId, serverId }),
            ]),
    });

    return {
        ...mutation,
        save: async (identity: AgentIdentityDraft) => {
            await withSavingToast(() =>
                mutation.mutateAsync({
                    agentId,
                    description: identity.description.trim() || null,
                    displayName: identity.displayName.trim(),
                    ...(identity.personality === undefined
                        ? {}
                        : { personality: identity.personality.trim() || null }),
                    serverId,
                })
            );
        },
    };
}
