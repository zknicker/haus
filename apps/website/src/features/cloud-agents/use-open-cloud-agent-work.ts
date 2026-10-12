import type { ActiveCloudAgentWorkLocation } from '@haus/api';
import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { requestMessageReveal } from '../../hooks/servers/use-pending-message-reveal.ts';
import { useThreadOpener } from '../../hooks/threads/use-thread-opener.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import { cloudAgentWorkOpenTarget } from './active-cloud-agent-work-location.ts';
import { useCloudAgentWorkView } from './use-cloud-agent-work-view.ts';

/**
 * Opens one active Cloud Agent work by its location (ADR 0044, Q4). The work
 * Thread peeks over the current page (`?work=`). A linking Message opens the
 * Thread it sits in or anchors when it has one, else the Message revealed in
 * its Channel or DM. Opening never creates or follows a Thread.
 */
export function useOpenCloudAgentWork() {
    const navigate = useNavigate();
    const { server } = useServerContext();
    const utils = hausTrpc.useUtils();
    const { openWork } = useCloudAgentWorkView();
    const openThread = useThreadOpener(server.slug);

    const fail = (title: string, error: unknown) => {
        toast.danger(title, {
            description: error instanceof Error ? error.message : 'Try again.',
        });
    };

    // A location names the Thread by its Chat; opening one needs its parent and anchor.
    const openThreadChat = async (threadChatId: string) => {
        try {
            const thread = await utils.thread.get.fetch({ serverId: server.id, threadChatId });
            openThread(thread.parentChatId, thread.anchorMessageId);
        } catch (error: unknown) {
            fail('Could not open that thread', error);
        }
    };

    const revealMessage = async (chatId: string, messageId: string) => {
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
            fail('Could not load that message', error);
        }
        navigate(serverChatRoute(server.slug, chatId));
    };

    return (work: { id: string; location: ActiveCloudAgentWorkLocation }) => {
        const target = cloudAgentWorkOpenTarget(work.location);
        switch (target.kind) {
            case 'work-thread':
                openWork(work.id);
                return;
            case 'thread':
                void openThreadChat(target.threadChatId);
                return;
            case 'message':
                void revealMessage(target.chatId, target.messageId);
                return;
            default:
                target satisfies never;
        }
    };
}
