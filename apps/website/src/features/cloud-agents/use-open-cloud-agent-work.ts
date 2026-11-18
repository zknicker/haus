import type { ActiveCloudAgentWorkLocation } from '@haus/api';
import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { requestMessageReveal } from '../../hooks/servers/use-pending-message-reveal.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute } from '../servers/server-routes.ts';

/**
 * Opens one active Cloud Agent work by its location (ADR 0044): the linking
 * Message revealed in its Channel, DM, or Task's Chat. There is no peek over
 * the current page (ADR 0053).
 */
export function useOpenCloudAgentWork() {
    const navigate = useNavigate();
    const { server } = useServerContext();
    const utils = hausTrpc.useUtils();
    return createCloudAgentWorkOpener({
        fail: (title, error) => {
            toast.danger(title, {
                description: error instanceof Error ? error.message : 'Try again.',
            });
        },
        fetchMessageSequence: async (chatId, messageId) => {
            const entity = await utils.chat.message.fetch({
                chatId,
                messageId,
                serverId: server.id,
            });
            return entity?.message.sequence ?? null;
        },
        navigate,
        slug: server.slug,
    });
}

export interface CloudAgentWorkOpenerDeps {
    fail: (title: string, error: unknown) => void;
    fetchMessageSequence: (chatId: string, messageId: string) => Promise<number | null>;
    navigate: (path: string, options: { state: unknown }) => void;
    slug: string;
}

/**
 * The opener over its read. The Message opens after a fetch, so the click's
 * gesture is read before it and passed on (ADR 0039): a ⌘- or middle-click
 * still opens a background tab once the fetch lands.
 */
export function createCloudAgentWorkOpener(deps: CloudAgentWorkOpenerDeps) {
    return (work: { id: string; location: ActiveCloudAgentWorkLocation }) => {
        const { chatId, messageId } = work.location;
        const gesture = currentOpenGesture();
        void (async () => {
            try {
                const sequence = await deps.fetchMessageSequence(chatId, messageId);
                if (sequence !== null) {
                    requestMessageReveal(chatId, { id: messageId, sequence });
                }
            } catch (error: unknown) {
                deps.fail('Could not load that message', error);
            }
            deps.navigate(serverChatRoute(deps.slug, chatId), { state: tabIntentState(gesture) });
        })();
    };
}
