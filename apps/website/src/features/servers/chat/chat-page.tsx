import { usePrefetchInfiniteQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useChat } from '../../../hooks/servers/use-chat.ts';
import { chatMessagesQueryOptions } from '../../../hooks/servers/use-chat-messages.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useTasks } from '../../../hooks/servers/use-tasks.ts';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { serverRouteModules } from '../../../routes/app/server-route-modules.ts';
import { serverChatRoute, serverRoute } from '../server-routes.ts';
import { ChatPagePending } from './chat-page-pending.tsx';
import { resolveChatPageChat } from './chat-page-state.ts';

const ChatView = React.lazy(async () => ({
    default: (await serverRouteModules.chat()).ChatView,
}));

export function ChatPage({ chatId, server }: { chatId: string; server: ServerDetail }) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const chatQuery = useChat(server.id, chatId);
    // The transcript needs only the route's ids, so its first page loads beside the chat
    // record instead of after it, the lazy ChatView, and Suspense's reveal throttle.
    const utils = hausTrpc.useUtils();
    usePrefetchInfiniteQuery(chatMessagesQueryOptions(utils.client, server.id, chatId));
    const chats = useChats(server.id);
    const chat = resolveChatPageChat({
        detail: chatQuery.data,
        isPending: chatQuery.isPending,
        listed: chats.data?.find((candidate) => candidate.id === chatId),
    });
    const taskMessageId = searchParams.get('task');
    // A `?task=` link addresses one task by id, so it reads the widened lens:
    // a background-tier task is hidden from the Board, never from its own link.
    const tasks = useTasks(server.id, chatId, {
        enabled: taskMessageId !== null,
        includeBackground: true,
    });
    const initialTask = tasks.data?.tasks.find((item) => item.task.messageId === taskMessageId);

    if (!chat && chatQuery.isPending) {
        return <ChatPagePending />;
    }

    if (!chat) {
        return <Navigate replace to={serverRoute(server.slug)} />;
    }

    return (
        <React.Suspense fallback={<ChatPagePending chat={chat} />} key={chat.id}>
            <ChatView
                chat={chat}
                initialTask={
                    initialTask
                        ? {
                              message: initialTask.message,
                              summary: initialTask.threadSummary,
                              threadChatId: initialTask.task.threadChatId,
                          }
                        : undefined
                }
                key={chat.id}
                onOpenChat={(nextChatId) => navigate(serverChatRoute(server.slug, nextChatId))}
                server={server}
            />
        </React.Suspense>
    );
}
