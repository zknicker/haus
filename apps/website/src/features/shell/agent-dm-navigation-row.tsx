import type { Agent, Chat } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { usePreloadAgentProfile } from '../../hooks/members/use-preload-agent-profile.ts';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { usePressNavigation } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from './dm-navigation-context-menu.tsx';

/**
 * An Agent's DM in the sidebar, memoized on a boolean `isCurrent` like the
 * Chat rows. Warming it also warms the Agent's record, which the DM shows.
 */
export const AgentDmNavigationRow = React.memo(function AgentDmNavigationRow({
    agent,
    chat,
    isCurrent,
    slug,
}: {
    agent: Agent;
    chat: Chat | null;
    isCurrent: boolean;
    slug: string;
}) {
    const { focusRef, preload: preloadChat } = usePreloadChat(agent.serverId, chat?.id);
    const preloadAgent = usePreloadAgentProfile(agent.id, 'record');
    const preload = React.useCallback(() => {
        preloadChat();
        preloadAgent();
    }, [preloadAgent, preloadChat]);
    const href = chat ? serverChatRoute(slug, chat.id) : serverAgentDmRoute(slug, agent.id);
    const pressRef = usePressNavigation(href, preload);
    const rowRef = React.useMemo(
        () => mergeRefs<HTMLDivElement>(focusRef, pressRef),
        [focusRef, pressRef]
    );
    const unreadCount = chat?.unreadCount ?? 0;

    return (
        <Sidebar.MenuItem
            href={href}
            id={`agent-dm:${agent.id}`}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
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
});
