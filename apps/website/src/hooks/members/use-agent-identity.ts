import { hausTrpc } from '../../lib/haus-server.tsx';
import { refreshAgent } from './agent-refresh.ts';

export interface AgentIdentityDraft {
    description: string;
    displayName: string;
}

/** Saves the Agent's public name and description; the caller owns the saving toast. */
export function useAgentIdentity(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.updateProfile.useMutation({
        onSuccess: () => refreshAgent(utils, serverId, agentId),
    });

    return {
        ...mutation,
        save: (identity: AgentIdentityDraft) =>
            mutation.mutateAsync({
                agentId,
                description: identity.description.trim() || null,
                displayName: identity.displayName.trim(),
                serverId,
            }),
    };
}
