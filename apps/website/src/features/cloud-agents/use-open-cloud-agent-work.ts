import type { ActiveCloudAgentWorkLocation } from '@haus/api';
import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { requestMessageReveal } from '../../hooks/servers/use-pending-message-reveal.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute, serverChatThreadRoute } from '../servers/server-routes.ts';
import { useCloudAgentWorkView } from './use-cloud-agent-work-view.ts';

/**
 * Opens one active Cloud Agent work by its location (ADR 0044, Q4). The work
 * Thread peeks over the current page (`?work=`). A linking Message opens its
 * Chat: its existing Thread when it anchors one, else the Message revealed in
 * the transcript. Opening never creates or follows a Thread.
 */
export function useOpenCloudAgentWork() {
    const navigate = useNavigate();
    const { server } = useServerContext();
    const utils = hausTrpc.useUtils();
    const { openWork } = useCloudAgentWorkView();

    const revealMessage = async (location: MessageLocation) => {
        const { chatId, messageId } = location;
        if (location.threadChatId) {
            navigate(serverChatThreadRoute(server.slug, chatId, messageId));
            return;
        }
        try {
            const entity = await utils.chat.message.fetch({
                chatId,
                messageId,
                serverId: server.id,
            });
            if (entity) {
                requestMessageReveal(chatId, { id: messageId, sequence: entity.message.sequence });
            }
        } catch (error: unknown) {
            toast.danger('Could not load that message', {
                description: error instanceof Error ? error.message : 'Try again.',
            });
        }
        navigate(serverChatRoute(server.slug, chatId));
    };

    return (work: { id: string; location: ActiveCloudAgentWorkLocation }) => {
        if (work.location.kind === 'work-thread') {
            openWork(work.id);
            return;
        }
        void revealMessage(work.location);
    };
}

type MessageLocation = Extract<ActiveCloudAgentWorkLocation, { kind: 'message' }>;
