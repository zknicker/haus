import * as React from 'react';
import { useParams } from 'react-router-dom';
import { ChatPage } from '../../features/servers/chat/chat-page.tsx';
import { ChatPagePending } from '../../features/servers/chat/chat-page-pending.tsx';
import { useChatViewModule } from '../../features/servers/chat/chat-view-module.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';

export function ChatRoute() {
    const { chatId = '' } = useParams();
    const { server } = useServerContext();
    return <ChatPage chatId={chatId} server={server} />;
}

export function ImplicitAgentDmRoute() {
    const { agentId = '' } = useParams();
    const { server } = useServerContext();
    const agents = useAgents(server.id);
    const agent = agents.data?.find((candidate) => candidate.id === agentId);
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
