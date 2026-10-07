import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useCreateServerChannel } from '../../hooks/servers/use-create-server-channel.ts';
import { useInboxUnreadCount } from '../../hooks/servers/use-inbox-unread-count.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import type { ChannelAgentOption } from '../chats/channel-agent-picker.tsx';
import { ChannelCreateDialog } from '../chats/channel-create-dialog.tsx';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { ChatNavigation } from './chat-navigation.tsx';

/** Contextual sidebar for the server: channels and DMs. */
export function AppSidebar({
    currentServer,
    onPreloadSection,
    selectedChatId,
    selectedAgentDmId,
}: {
    currentServer: ServerSummary;
    onPreloadSection: (section: 'activity' | 'inbox' | 'search' | 'tasks') => void;
    selectedChatId: string | undefined;
    selectedAgentDmId?: string;
}) {
    const navigate = useNavigate();
    const agents = useAgents(currentServer.id);
    const chats = useChats(currentServer.id);
    const createChannel = useCreateServerChannel();
    // The sidebar owns the Inbox badge's read, the same way it owns the chat
    // list the unread chips ride on; the rows below stay presentation.
    const inboxUnread = useInboxUnreadCount(currentServer.id);
    const [creatingChannel, setCreatingChannel] = React.useState(false);
    const [creatingAgent, setCreatingAgent] = React.useState(false);
    const slug = currentServer.slug;
    const canManage = currentServer.role === 'owner' || currentServer.role === 'admin';
    const agentItems = agents.data ?? [];
    const chatItems = chats.data ?? [];
    const channelAgents: ChannelAgentOption[] = agentItems.map((agent) => ({
        avatarUrl: agent.avatarUrl,
        id: agent.id,
        name: agent.displayName,
    }));
    const openCreateChannel = () => {
        createChannel.reset();
        setCreatingChannel(true);
    };

    return (
        <>
            <ChatNavigation
                agents={agentItems}
                chats={chatItems}
                inboxUnreadCount={inboxUnread.count}
                onCreateAgent={canManage ? () => setCreatingAgent(true) : undefined}
                onCreateChannel={openCreateChannel}
                onPreloadSection={onPreloadSection}
                selectedAgentDmId={selectedAgentDmId}
                selectedChatId={selectedChatId}
                serverId={currentServer.id}
                slug={slug}
            />
            <CreateAgentDialog
                agents={agentItems}
                onCreated={(agentId) => {
                    setCreatingAgent(false);
                    navigate(serverAgentDmRoute(slug, agentId));
                }}
                onOpenChange={setCreatingAgent}
                open={creatingAgent}
                serverId={currentServer.id}
            />
            <ChannelCreateDialog
                agents={channelAgents}
                agentsPending={agents.isPending}
                errorMessage={createChannel.error?.message ?? null}
                isPending={createChannel.isPending}
                onClose={() => {
                    createChannel.reset();
                    setCreatingChannel(false);
                }}
                onSubmit={async ({ agentIds, color, icon, name }) => {
                    const channel = await createChannel.mutateAsync({
                        agentIds,
                        color,
                        icon,
                        name,
                        serverId: currentServer.id,
                    });
                    setCreatingChannel(false);
                    navigate(serverChatRoute(slug, channel.id));
                }}
                open={creatingChannel}
            />
        </>
    );
}
