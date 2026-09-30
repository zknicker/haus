import { EmptyState } from '@heroui-pro/react';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Navigate, useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useWindowTitle } from '../../../hooks/shell/use-window-title.ts';
import { getDesktopBridge } from '../../../lib/desktop-bridge.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { ChatDetailFrame } from '../../chats/chat-detail-frame.tsx';
import { SectionHeader } from '../../shell/section-header.tsx';
import { PageTopbar, WorkspaceBandActions } from '../../shell/shell-topbar.tsx';
import { serverChatRoute, serverRoute } from '../server-routes.ts';
import { ImplicitAgentDmComposer } from './chat-composer-variants.tsx';
import { ChatTopbarIdentity } from './chat-topbar.tsx';
import { DmActions } from './dm-actions.tsx';

export function ImplicitAgentDmPage({
    agentId,
    server,
}: {
    agentId: string;
    server: ServerDetail;
}) {
    const agents = useAgents(server.id);
    const navigate = useNavigate();
    const agent = agents.data?.find((candidate) => candidate.id === agentId);
    useWindowTitle(agent?.displayName ?? 'Direct message');

    if (!agent && agents.isPending) {
        return null;
    }
    if (!agent) {
        return <Navigate replace to={serverRoute(server.slug)} />;
    }

    const selectionKey = `implicit-agent-dm:${agent.id}`;
    const compact = Boolean(getDesktopBridge()?.browserCommand);
    const actions = (
        <DmActions
            chatName={agent.displayName}
            content={null}
            peerAgent={agent}
            slug={server.slug}
        />
    );

    return (
        <section
            aria-label={agent.displayName}
            className="relative flex min-h-0 flex-1"
            data-slot="chat-surface"
        >
            <PageTopbar>
                {compact ? (
                    // Desktop: the primary workspace tab already names the Agent,
                    // so only the actions menu rides along, at the band's end.
                    <>
                        <WorkspaceBandActions>{actions}</WorkspaceBandActions>
                        <h1 className="sr-only">{agent.displayName}</h1>
                    </>
                ) : (
                    <SectionHeader
                        leading={
                            <ChatTopbarIdentity
                                mark={
                                    <EntityAvatar
                                        name={agent.displayName}
                                        size={24}
                                        src={agent.avatarUrl ?? null}
                                    />
                                }
                                name={agent.displayName}
                            />
                        }
                    >
                        {actions}
                    </SectionHeader>
                )}
            </PageTopbar>
            <ChatDetailFrame
                activeReplies={[]}
                chatId={selectionKey}
                empty={
                    <EmptyState>
                        <EmptyState.Header>
                            <EmptyState.Media variant="icon">
                                <Icon aria-hidden="true" icon={Message01Icon} />
                            </EmptyState.Media>
                            <EmptyState.Title>No messages yet</EmptyState.Title>
                            <EmptyState.Description>
                                Send the first message to {agent.displayName}.
                            </EmptyState.Description>
                        </EmptyState.Header>
                    </EmptyState>
                }
                footer={
                    <ImplicitAgentDmComposer
                        agentId={agent.id}
                        chatName={agent.displayName}
                        onMaterialized={(chatId) =>
                            navigate(serverChatRoute(server.slug, chatId), { replace: true })
                        }
                        serverId={server.id}
                    />
                }
                historyLoaded
                isPending={false}
                rowCount={0}
                timelineContent={() => null}
            />
        </section>
    );
}
