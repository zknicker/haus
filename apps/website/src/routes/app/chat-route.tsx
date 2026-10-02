import * as React from 'react';
import { useParams } from 'react-router-dom';
import { ChatPage } from '../../features/servers/chat/chat-page.tsx';
import { ChatPagePending } from '../../features/servers/chat/chat-page-pending.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ImplicitAgentDmPage = React.lazy(async () => ({
    default: (await serverRouteModules.chat()).ImplicitAgentDmPage,
}));

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
            <ImplicitAgentDmPage agentId={agentId} server={server} />
        </React.Suspense>
    );
}
