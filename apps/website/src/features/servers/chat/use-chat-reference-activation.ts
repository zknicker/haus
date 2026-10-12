import {
    parseAgentReferenceTarget,
    parseChatReferenceTarget,
    parseChatThreadReferenceTarget,
} from '@haus/api';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { useThreadOpener } from '../../../hooks/threads/use-thread-opener.ts';
import type { ReferenceActivationTarget } from '../../mentions/mention-types.ts';

export function useChatReferenceActivation(onOpenChat: (id: string) => void) {
    const openAgentProfile = useOpenAgentProfile();
    const { slug = '' } = useParams();
    const openThread = useThreadOpener(slug);
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
                const thread = parseChatThreadReferenceTarget(reference.id);
                if (thread) {
                    openThread(thread.chatId, thread.anchorMessageId);
                    return;
                }
                const targetChatId = parseChatReferenceTarget(reference.id);
                if (targetChatId) {
                    onOpenChat(targetChatId);
                }
            }
        },
        [onOpenChat, openAgentProfile, openThread]
    );
}
