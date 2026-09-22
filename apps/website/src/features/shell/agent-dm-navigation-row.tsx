import type { Agent, Chat } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { cn } from '../../lib/utils.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from './dm-navigation-context-menu.tsx';

export function AgentDmNavigationRow({
    agent,
    chat,
    selectedAgentDmId,
    selectedChatId,
    slug,
}: {
    agent: Agent;
    chat: Chat | null;
    selectedAgentDmId: string | undefined;
    selectedChatId: string | undefined;
    slug: string;
}) {
    const { focusRef, preload } = usePreloadChat(agent.serverId, chat?.id);
    const href = chat ? serverChatRoute(slug, chat.id) : serverAgentDmRoute(slug, agent.id);
    const unreadCount = chat?.unreadCount ?? 0;

    return (
        <Sidebar.MenuItem
            href={href}
            id={`agent-dm:${agent.id}`}
            isCurrent={
                agent.id === selectedAgentDmId || Boolean(chat && chat.id === selectedChatId)
            }
            onHoverStart={preload}
            ref={focusRef}
            textValue={agent.displayName}
        >
            <DmNavigationContextMenu
                agent={agent}
                chatId={chat?.id ?? null}
                chatName={agent.displayName}
                href={href}
                slug={slug}
            >
                <Sidebar.MenuIcon>
                    <AgentAvatar agent={agent} size={24} />
                </Sidebar.MenuIcon>
                <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel
                        className={cn('ms-[2px]', unreadCount > 0 && 'font-medium text-foreground')}
                    >
                        {agent.displayName}
                    </Sidebar.MenuLabel>
                    {unreadCount > 0 ? <UnreadCountChip count={unreadCount} /> : null}
                </Sidebar.MenuItemContent>
            </DmNavigationContextMenu>
        </Sidebar.MenuItem>
    );
}
