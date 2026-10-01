import { parseAgentReferenceTarget, parseChatReferenceTarget } from '@haus/api';
import { useCallback } from 'react';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import type { ReferenceActivationTarget } from '../../mentions/mention-types.ts';

export function useChatReferenceActivation(onOpenChat: (id: string) => void) {
    const openAgentProfile = useOpenAgentProfile();
    return useCallback(
        (reference: ReferenceActivationTarget) => {
            if (reference.kind === 'agent') {
                const agentId = parseAgentReferenceTarget(reference.id);
                if (agentId) {
                    openAgentProfile(agentId);
                }
                return;
            }
            if (reference.kind === 'chat') {
                const targetChatId = parseChatReferenceTarget(reference.id);
                if (targetChatId) {
                    onOpenChat(targetChatId);
                }
            }
        },
        [onOpenChat, openAgentProfile]
    );
}
