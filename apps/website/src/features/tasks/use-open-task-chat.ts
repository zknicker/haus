import type { TaskMention } from '@haus/api';
import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useChatAppearances } from '../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute, serverChatThreadRoute } from '../servers/server-routes.ts';

/**
 * Opens a message a Task's Mentioned in lists. A Thread reply opens its Thread;
 * a top-level message opens the Thread on it, where a reply about the Task
 * belongs. The mention names its place, so nothing is read on the press.
 */
export function useOpenTaskMention() {
    const { server } = useServerContext();
    const navigate = useNavigate();

    return ({ messageId, place }: TaskMention) => {
        navigate(
            serverChatThreadRoute(
                server.slug,
                place.chatId,
                place.threadAnchorMessageId ?? messageId
            )
        );
    };
}

/**
 * Opens the Chat a Reminder is anchored in. A Chat outside `chat.list` is a
 * Thread: its parent is read here, on the press, so a Task with many Reminders
 * asks for at most the one that is opened.
 */
export function useOpenTaskChat() {
    const { server } = useServerContext();
    const chats = useChatAppearances(server.id);
    const utils = hausTrpc.useUtils();
    const navigate = useNavigate();

    return (chatId: string) => {
        if (chats.has(chatId)) {
            navigate(serverChatRoute(server.slug, chatId));
            return;
        }
        utils.thread.get
            .fetch({ serverId: server.id, threadChatId: chatId })
            .then(({ anchorMessageId, parentChatId }) =>
                navigate(serverChatThreadRoute(server.slug, parentChatId, anchorMessageId))
            )
            .catch((error: Error) =>
                toast.danger('Could not open that Thread', { description: error.message })
            );
    };
}
