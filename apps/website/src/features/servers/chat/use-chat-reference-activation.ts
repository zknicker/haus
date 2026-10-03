import {
    parseAgentReferenceTarget,
    parseChatReferenceTarget,
    parseChatThreadReferenceTarget,
} from '@haus/api';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { useOpenThread } from '../../../hooks/threads/use-open-thread.ts';
import type { ReferenceActivationTarget } from '../../mentions/mention-types.ts';
import { serverChatThreadRoute } from '../server-routes.ts';

export function useChatReferenceActivation(onOpenChat: (id: string) => void) {
    const openAgentProfile = useOpenAgentProfile();
    const openThread = useOpenThread();
    const navigate = useNavigate();
    const { slug = '' } = useParams();
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
                    if (openThread) {
                        openThread(thread.chatId, thread.anchorMessageId);
                    } else {
                        navigate(
                            serverChatThreadRoute(slug, thread.chatId, thread.anchorMessageId)
                        );
                    }
                    return;
                }
                const targetChatId = parseChatReferenceTarget(reference.id);
                if (targetChatId) {
                    onOpenChat(targetChatId);
                }
            }
        },
        [onOpenChat, openAgentProfile, openThread, navigate, slug]
    );
}
