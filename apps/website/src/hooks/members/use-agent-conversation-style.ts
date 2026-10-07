import type { UpdateAgentConversationStyleInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** A change to the Agent's voice layer: absent leaves a field alone, null clears it. */
export type AgentConversationStyleChange = Pick<
    UpdateAgentConversationStyleInput,
    'conversationStyle' | 'signatureEmoji'
>;

/**
 * The Agent's private conversation style and signature emoji. Only Owners and Admins may read
 * them, so callers enable the query exactly when they could edit them; everyone else never asks.
 */
export function useAgentConversationStyle(serverId: string, agentId: string, enabled: boolean) {
    return hausTrpc.agent.conversationStyle.useQuery(
        { agentId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
}

/** Saves a conversation style or signature emoji change, then refreshes the private read. */
export function useUpdateAgentConversationStyle(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.updateConversationStyle.useMutation({
        onSuccess: () => utils.agent.conversationStyle.invalidate({ agentId, serverId }),
    });

    return {
        ...mutation,
        save: (change: AgentConversationStyleChange) =>
            mutation.mutateAsync({
                agentId,
                serverId,
                ...(change.conversationStyle === undefined
                    ? {}
                    : { conversationStyle: change.conversationStyle?.trim() || null }),
                ...(change.signatureEmoji === undefined
                    ? {}
                    : { signatureEmoji: change.signatureEmoji }),
            }),
    };
}
