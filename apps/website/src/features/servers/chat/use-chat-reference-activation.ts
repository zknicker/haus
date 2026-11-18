import {
    parseAgentReferenceTarget,
    parseChatMessageReferenceTarget,
    parseChatReferenceTarget,
} from '@haus/api';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import type { ReferenceActivationTarget } from '../../mentions/mention-types.ts';
import { serverChatMessageRoute } from '../server-routes.ts';

export function useChatReferenceActivation(onOpenChat: (id: string) => void) {
    const openAgentProfile = useOpenAgentProfile();
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
                const message = parseChatMessageReferenceTarget(reference.id);
                if (message) {
                    navigate(serverChatMessageRoute(slug, message.chatId, message.messageId));
                    return;
                }
                const targetChatId = parseChatReferenceTarget(reference.id);
                if (targetChatId) {
                    onOpenChat(targetChatId);
                }
            }
        },
        [navigate, onOpenChat, openAgentProfile, slug]
    );
}
