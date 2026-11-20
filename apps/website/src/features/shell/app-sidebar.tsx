import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateServerChannel } from '../../hooks/servers/use-create-server-channel.ts';
import { useInboxUnreadCount } from '../../hooks/servers/use-inbox-unread-count.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';
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
    const createChannel = useCreateServerChannel();
    // The sidebar owns the Inbox badge's read; the chat rows read their own
    // list entries.
    const inboxUnread = useInboxUnreadCount(currentServer.id);
    const [creatingChannel, setCreatingChannel] = React.useState(false);
    const [creatingAgent, setCreatingAgent] = React.useState(false);
    const slug = currentServer.slug;
    const canManage = currentServer.role === 'owner' || currentServer.role === 'admin';
    const openCreateChannel = () => {
        createChannel.reset();
        setCreatingChannel(true);
    };

    return (
        <>
            <ChatNavigation
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
                onCreated={(agentId) => {
                    setCreatingAgent(false);
                    navigate(serverAgentDmRoute(slug, agentId));
                }}
                onOpenChange={setCreatingAgent}
                open={creatingAgent}
                serverId={currentServer.id}
            />
            <ChannelCreateDialog
                errorMessage={createChannel.error?.message ?? null}
                isPending={createChannel.isPending}
                onClose={() => {
                    createChannel.reset();
                    setCreatingChannel(false);
                }}
                onSubmit={async ({ color, icon, name }) => {
                    const { chat } = await createChannel.mutateAsync({
                        color,
                        icon,
                        name,
                        serverId: currentServer.id,
                    });
                    setCreatingChannel(false);
                    navigate(serverChatRoute(slug, chat.id));
                }}
                open={creatingChannel}
            />
        </>
    );
}
