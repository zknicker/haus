import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { agentDm } from '../../features/capy-shell/sidebar-model.ts';
import { ChatPagePending } from '../../features/servers/chat/chat-page-pending.tsx';
import { ChatPage } from '../../features/servers/chat/chat-page.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverChatRoute, serverRoute } from '../../features/servers/server-routes.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChatListSelection } from '../../hooks/servers/use-chats.ts';

export function ChatRoute() {
    const { chatId = '' } = useParams();
    const { server } = useServerContext();
    return <ChatPage chatId={chatId} server={server} />;
}

/** A Captain's address (`captainChatRoute`): it lands on the Captain's one shared Captain chat. */
export function CaptainChatRoute() {
    const { agentId = '' } = useParams();
    const { server } = useServerContext();
    const agent = useAgents(server.id).data?.find((candidate) => candidate.id === agentId);
    const select = React.useCallback(
        (chats: Parameters<typeof agentDm>[0]) => agentDm(chats, agentId)?.id ?? null,
        [agentId]
    );
    const chatId = useChatListSelection(server.id, select);
    if (chatId === undefined) {
        return <ChatPagePending agent={agent} />;
    }
    return <Navigate replace to={chatId ? serverChatRoute(server.slug, chatId) : serverRoute(server.slug)} />;
}
