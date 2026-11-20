import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInboxUnreadCount } from '../../hooks/servers/use-inbox-unread-count.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { ChatNavigation } from './chat-navigation.tsx';
import { NewProjectDialog } from './new-project-dialog.tsx';

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
    // The sidebar owns the Inbox badge's read; the chat rows read their own
    // list entries.
    const inboxUnread = useInboxUnreadCount(currentServer.id);
    const [creatingChannel, setCreatingChannel] = React.useState(false);
    const [creatingAgent, setCreatingAgent] = React.useState(false);
    const slug = currentServer.slug;
    const canManage = currentServer.role === 'owner' || currentServer.role === 'admin';

    return (
        <>
            <ChatNavigation
                inboxUnreadCount={inboxUnread.count}
                onCreateAgent={canManage ? () => setCreatingAgent(true) : undefined}
                onCreateChannel={() => setCreatingChannel(true)}
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
            <NewProjectDialog
                onClose={() => setCreatingChannel(false)}
                onCreated={(chatId) => navigate(serverChatRoute(slug, chatId))}
                open={creatingChannel}
                serverId={currentServer.id}
            />
        </>
    );
}
