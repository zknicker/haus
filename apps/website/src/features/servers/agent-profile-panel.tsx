import { useNavigate } from 'react-router-dom';
import { useAgent } from '../../hooks/members/use-agent.ts';
import {
    closeAgentProfilePane,
    useAgentProfilePane,
} from '../../hooks/pane/use-agent-profile-pane.ts';
import { useChatSidePane } from '../../hooks/pane/use-chat-side-pane.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { ChatSidePaneShell } from '../chats/chat-side-pane-shell.tsx';
import { AgentPeek, AgentPeekBody } from '../members/agent-peek/agent-peek.tsx';
import { AgentPeekHeader } from '../members/agent-peek/agent-peek-header.tsx';
import { PeekSection } from '../members/agent-peek/peek-section.tsx';
import { AgentLoading } from '../members/agent-profile/agent-loading.tsx';
import { agentProfileRoute } from './server-routes.ts';

export function AgentProfilePanel({
    chatId,
    server,
    takeover = false,
}: {
    chatId: string;
    server: ServerDetail;
    takeover?: boolean;
}) {
    const navigate = useNavigate();
    const agentId = useAgentProfilePane(chatId);
    const activeSidePane = useChatSidePane(chatId);
    const agent = useAgent(server.id, agentId ?? undefined);
    const unavailable = agent.isError && (!agent.data || agent.error.data?.code === 'NOT_FOUND');

    return (
        <ChatSidePaneShell
            label="Agent profile"
            open={activeSidePane === 'profile' && agentId !== null}
            takeover={takeover}
        >
            {(width) => (
                <div
                    className="flex h-full min-h-0 flex-1 flex-col"
                    style={{ width: width ?? undefined }}
                >
                    <AgentPeekHeader
                        agent={unavailable ? undefined : agent.data}
                        onClose={() => closeAgentProfilePane(chatId)}
                        onOpenProfile={() => {
                            if (agentId) {
                                navigate(agentProfileRoute(server.slug, agentId));
                                closeAgentProfilePane(chatId);
                            }
                        }}
                        server={server}
                    />
                    {unavailable ? (
                        <div
                            className="m-auto flex flex-col items-center gap-3 px-6 text-center"
                            style={{ width: width ?? undefined }}
                        >
                            <div>
                                <p className="font-medium text-foreground text-sm">
                                    Agent unavailable
                                </p>
                                <p className="mt-1 text-muted text-sm">
                                    This Agent may have been removed.
                                </p>
                            </div>
                        </div>
                    ) : agent.data ? (
                        <div
                            className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                            style={{ width: width ?? undefined }}
                        >
                            <AgentPeek
                                agent={agent.data}
                                key={agent.data.id}
                                onClose={() => closeAgentProfilePane(chatId)}
                                server={server}
                            />
                        </div>
                    ) : (
                        <AgentPeekBody>
                            <AgentLoading label="Loading Agent" />
                            {[
                                'Recent activity',
                                'Chats',
                                ...(server.role === 'member' ? [] : ['Automations']),
                                'Skills',
                                'Connections',
                            ].map((title) => (
                                <PeekSection key={title} title={title}>
                                    {null}
                                </PeekSection>
                            ))}
                        </AgentPeekBody>
                    )}
                </div>
            )}
        </ChatSidePaneShell>
    );
}
