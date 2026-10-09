import { usePrefetchInfiniteQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useChat } from '../../../hooks/servers/use-chat.ts';
import { chatMessagesQueryOptions } from '../../../hooks/servers/use-chat-messages.ts';
import { useListedChat } from '../../../hooks/servers/use-chats.ts';
import { useTasks } from '../../../hooks/servers/use-tasks.ts';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { serverChatRoute, serverRoute } from '../server-routes.ts';
import { ChatPagePending } from './chat-page-pending.tsx';
import { resolveChatPageChat } from './chat-page-state.ts';
import { useChatViewModule } from './chat-view-module.ts';
import { KeptChatViews } from './kept-chat-views.tsx';

/**
 * The chat route; recent chat views stay mounted (hidden) so returning to one
 * reveals it. Route reads (`?task=`, navigate) stay up here and each kept view
 * is memoized on stable props, so a navigation re-renders only the views whose
 * visibility changed, not every hidden one.
 */
export function ChatPage({ chatId, server }: { chatId: string; server: ServerDetail }) {
    const [searchParams] = useSearchParams();
    const taskMessageId = searchParams.get('task');
    // Stable across navigations, desktop tab routers included (patched React Router).
    const navigate = useNavigate();
    const onOpenChat = React.useCallback(
        (nextChatId: string) => navigate(serverChatRoute(server.slug, nextChatId)),
        [navigate, server.slug]
    );
    return (
        <KeptChatViews
            chatId={chatId}
            renderChat={(id, active) => (
                <ChatPageView
                    active={active}
                    chatId={id}
                    onOpenChat={onOpenChat}
                    server={server}
                    taskMessageId={active ? taskMessageId : null}
                />
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
    taskMessageId: routeTaskMessageId,
}: {
    active: boolean;
    chatId: string;
    onOpenChat: (chatId: string) => void;
    server: ServerDetail;
    taskMessageId: string | null;
}) {
    const chatQuery = useChat(server.id, chatId);
    // The transcript needs only the route's ids, so its first page loads beside the chat
    // record instead of after it.
    const utils = hausTrpc.useUtils();
    usePrefetchInfiniteQuery(chatMessagesQueryOptions(utils.client, server.id, chatId));
    const listed = useListedChat(server.id, chatId);
    const chat = resolveChatPageChat({
        detail: chatQuery.data,
        isPending: chatQuery.isPending,
        listed,
    });
    // The route's `?task=` belongs to the shown chat; a hidden view keeps the one it last had.
    const taskMessageId = useActiveValue(active, routeTaskMessageId);
    // A `?task=` link addresses one task by id, so it reads the widened lens:
    // a background-tier task is hidden from the Board, never from its own link.
    const tasks = useTasks(server.id, chatId, {
        enabled: taskMessageId !== null,
        includeBackground: true,
    });
    const task = tasks.data?.tasks.find((item) => item.task.messageId === taskMessageId);
    const initialTask = React.useMemo(
        () =>
            task
                ? {
                      message: task.message,
                      summary: task.threadSummary,
                      threadChatId: task.task.threadChatId,
                  }
                : undefined,
        [task]
    );

    if (!chat && chatQuery.isPending) {
        return <ChatPagePending />;
    }

    if (!chat) {
        // A kept view stays effect-alive while hidden; only the shown chat may leave the route.
        return active ? <Navigate replace to={serverRoute(server.slug)} /> : null;
    }

    return (
        <React.Suspense fallback={<ChatPagePending chat={chat} />}>
            <ChatViewModule
                chat={chat}
                initialTask={initialTask}
                onOpenChat={onOpenChat}
                server={server}
            />
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

function useActiveValue<T>(active: boolean, value: T) {
    const [held, setHeld] = React.useState(value);
    if (active && held !== value) {
        setHeld(value);
    }
    return active ? value : held;
}
