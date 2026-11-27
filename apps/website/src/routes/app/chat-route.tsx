import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { agentDm } from '../../features/capy-shell/sidebar-model.ts';
import { ChatPagePending } from '../../features/servers/chat/chat-page-pending.tsx';
import { ChatPage } from '../../features/servers/chat/chat-page.tsx';
import { useChatViewModule } from '../../features/servers/chat/chat-view-module.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverChatRoute } from '../../features/servers/server-routes.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChatListSelection } from '../../hooks/servers/use-chats.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';

export function ChatRoute() {
    const { chatId = '' } = useParams();
    const { server } = useServerContext();
    return <ChatPage chatId={chatId} server={server} />;
}

/**
 * A Captain's DM by its id: the existing DM when there is one, else the implicit DM page that
 * creates it on the first send. Opening a Captain lands here (`captainChatRoute`). The choice
 * is made once: a DM that appears while the implicit page is open (a Trigger anchors one) does
 * not swap the page out from under an open sheet.
 */
export function ImplicitAgentDmRoute() {
    const { agentId = '' } = useParams();
    const { server } = useServerContext();
    const agents = useAgents(server.id);
    const agent = agents.data?.find((candidate) => candidate.id === agentId);
    const select = React.useCallback(
        (chats: Parameters<typeof agentDm>[0]) => agentDm(chats, agentId)?.id ?? null,
        [agentId]
    );
    const listedDmChatId = useChatListSelection(server.id, select);
    const [resolved, setResolved] = React.useState({ agentId, dmChatId: listedDmChatId });
    if (
        resolved.agentId !== agentId ||
        (resolved.dmChatId === undefined && listedDmChatId !== undefined)
    ) {
        setResolved({ agentId, dmChatId: listedDmChatId });
    }
    const dmChatId = resolved.agentId === agentId ? resolved.dmChatId : listedDmChatId;
    if (dmChatId === undefined) {
        return <ChatPagePending agent={agent} />;
    }
    if (dmChatId) {
        return <Navigate replace to={serverChatRoute(server.slug, dmChatId)} />;
    }
    return (
        <React.Suspense fallback={<ChatPagePending agent={agent} />} key={agentId}>
            <ImplicitAgentDmModule agentId={agentId} server={server} />
        </React.Suspense>
    );
}

/** Renders synchronously once the chat chunk is loaded; suspends only on a cold chunk. */
function ImplicitAgentDmModule({ agentId, server }: { agentId: string; server: ServerDetail }) {
    const { ImplicitAgentDmPage } = useChatViewModule();
    return <ImplicitAgentDmPage agentId={agentId} server={server} />;
}
