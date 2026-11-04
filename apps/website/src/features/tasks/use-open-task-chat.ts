import { toast } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useChatAppearances } from '../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { serverChatRoute, serverChatThreadRoute } from '../servers/server-routes.ts';

/**
 * Opens a Chat a Task points at, on a message when it names one. A top-level
 * message opens the Thread on it, where a reply about the Task belongs. A Chat
 * outside `chat.list` is a Thread: its parent is read here, on the press, so a
 * Task with fifty mentions asks for at most the one that is opened.
 */
export function useOpenTaskChat() {
    const { server } = useServerContext();
    const chats = useChatAppearances(server.id);
    const utils = hausTrpc.useUtils();
    const navigate = useNavigate();

    return (chatId: string, messageId?: string) => {
        if (chats.has(chatId)) {
            navigate(
                messageId
                    ? serverChatThreadRoute(server.slug, chatId, messageId)
                    : serverChatRoute(server.slug, chatId)
            );
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
