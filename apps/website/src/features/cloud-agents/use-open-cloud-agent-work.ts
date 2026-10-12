import type { ActiveCloudAgentWorkLocation } from '@haus/api';
import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { tabIntentState } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture, type OpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
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
        fetchThread: (threadChatId) =>
            utils.thread.get.fetch({ serverId: server.id, threadChatId }),
        navigate,
        openThread,
        openWork,
        slug: server.slug,
    });
}

export interface CloudAgentWorkOpenerDeps {
    fail: (title: string, error: unknown) => void;
    fetchMessageSequence: (chatId: string, messageId: string) => Promise<number | null>;
    fetchThread: (
        threadChatId: string
    ) => Promise<{ anchorMessageId: string; parentChatId: string }>;
    navigate: (path: string, options: { state: unknown }) => void;
    openThread: (chatId: string, anchorMessageId: string, gesture: OpenGesture) => void;
    openWork: (workId: string) => void;
    slug: string;
}

/**
 * The opener over its reads. Thread and Message targets open after a fetch, so the click's
 * gesture is read before it and passed on (ADR 0039): a ⌘- or middle-click still opens a
 * background tab once the fetch lands.
 */
export function createCloudAgentWorkOpener(deps: CloudAgentWorkOpenerDeps) {
    // A location names the Thread by its Chat; opening one needs its parent and anchor.
    const openThreadChat = async (threadChatId: string, gesture: OpenGesture) => {
        try {
            const thread = await deps.fetchThread(threadChatId);
            deps.openThread(thread.parentChatId, thread.anchorMessageId, gesture);
        } catch (error: unknown) {
            deps.fail('Could not open that thread', error);
        }
    };

    const revealMessage = async (chatId: string, messageId: string, gesture: OpenGesture) => {
        try {
            const sequence = await deps.fetchMessageSequence(chatId, messageId);
            if (sequence !== null) {
                requestMessageReveal(chatId, { id: messageId, sequence });
            }
        } catch (error: unknown) {
            deps.fail('Could not load that message', error);
        }
        deps.navigate(serverChatRoute(deps.slug, chatId), { state: tabIntentState(gesture) });
    };

    return (work: { id: string; location: ActiveCloudAgentWorkLocation }) => {
        const target = cloudAgentWorkOpenTarget(work.location);
        const gesture = currentOpenGesture();
        switch (target.kind) {
            case 'work-thread':
                deps.openWork(work.id);
                return;
            case 'thread':
                void openThreadChat(target.threadChatId, gesture);
                return;
            case 'message':
                void revealMessage(target.chatId, target.messageId, gesture);
                return;
            default:
                target satisfies never;
        }
    };
}
