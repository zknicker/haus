import { usePrefetchInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useChat } from '../../../hooks/servers/use-chat.ts';
import { chatMessagesQueryOptions } from '../../../hooks/servers/use-chat-messages.ts';
import { useListedChat } from '../../../hooks/servers/use-chats.ts';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { redirectRetiredRoute } from '../retired-routes.ts';
import { serverChatRoute, serverRoute } from '../server-routes.ts';
import { ChatPagePending } from './chat-page-pending.tsx';
import { resolveChatPageChat } from './chat-page-state.ts';
import { useChatViewModule } from './chat-view-module.ts';
import { KeptChatViews } from './kept-chat-views.tsx';

export function ChatPage({ chatId, server }: { chatId: string; server: ServerDetail }) {
    const location = useLocation();
    // Stable across navigations, desktop tab routers included (patched React Router).
    const navigate = useNavigate();
    const onOpenChat = React.useCallback(
        (nextChatId: string) => navigate(serverChatRoute(server.slug, nextChatId)),
        [navigate, server.slug]
    );
    const retired = redirectRetiredRoute(location);
    if (retired) {
        return <Navigate replace to={retired} />;
    }
    return (
        <KeptChatViews
            chatId={chatId}
            renderChat={(id, active) => (
                <ChatPageView active={active} chatId={id} onOpenChat={onOpenChat} server={server} />
            )}
            serverId={server.id}
        />
    );
}

const ChatPageView = React.memo(function ChatPageView({
    active,
    chatId,
    onOpenChat,
    server,
}: {
    active: boolean;
    chatId: string;
    onOpenChat: (chatId: string) => void;
    server: ServerDetail;
}) {
    const chatQuery = useChat(server.id, chatId);
    // The transcript needs only the route's ids, so its first page loads beside the chat
    // record instead of after it.
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();
    usePrefetchInfiniteQuery(
        chatMessagesQueryOptions({ client: utils.client, queryClient }, server.id, chatId)
    );
    // The listed row is only the pending fallback: past it, its unread count
    // and activity would re-render the whole Chat on every read and message.
    const listed = useListedChat(server.id, chatId, chatQuery.data === undefined);
    const chat = resolveChatPageChat({
        detail: chatQuery.data,
        isPending: chatQuery.isPending,
        listed,
    });
    if (!chat && chatQuery.isPending) {
        return <ChatPagePending />;
    }

    if (!chat) {
        // A kept view stays effect-alive while hidden; only the shown chat may leave the route.
        return active ? <Navigate replace to={serverRoute(server.slug)} /> : null;
    }

    return (
        <React.Suspense fallback={<ChatPagePending chat={chat} />}>
            <ChatViewModule chat={chat} onOpenChat={onOpenChat} server={server} />
        </React.Suspense>
    );
});

/** Renders synchronously once the chat chunk is loaded; suspends only on a cold chunk. */
const ChatViewModule = React.memo(function ChatViewModule(
    props: React.ComponentProps<ChatViewComponent>
) {
    const { ChatView } = useChatViewModule();
    return <ChatView {...props} />;
});

type ChatViewComponent = ReturnType<typeof useChatViewModule>['ChatView'];
