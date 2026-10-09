import { Sidebar } from '@heroui-pro/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { useAgentMark } from '../../hooks/members/use-agents.ts';
import { usePreloadAgentRecord } from '../../hooks/members/use-preload-agent-profile.ts';
import { useAgentDmEntry } from '../../hooks/servers/use-chats.ts';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { LiveAgentAvatar } from '../members/agent-avatar.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from './dm-navigation-context-menu.tsx';

/**
 * An Agent's DM in the sidebar, memoized on a boolean `isCurrent` like the
 * Chat rows. It reads only what it shows: the Agent's mark (its presence dot
 * reads availability itself) and its DM's unread count, so an Agent turn or a
 * message elsewhere leaves it alone. Warming it also warms the Agent's
 * record, which the DM shows.
 */
export const AgentDmNavigationRow = React.memo(function AgentDmNavigationRow({
    agentId,
    isCurrent,
    serverId,
    slug,
}: {
    agentId: string;
    isCurrent: boolean;
    serverId: string;
    slug: string;
}) {
    const agent = useAgentMark(serverId, agentId);
    const dm = useAgentDmEntry(serverId, agentId);
    const { focusRef, preload: preloadChat } = usePreloadChat(serverId, dm?.id);
    const preloadAgent = usePreloadAgentRecord(serverId, agentId);
    const preload = React.useCallback(() => {
        preloadChat();
        preloadAgent();
    }, [preloadAgent, preloadChat]);
    const href = dm ? serverChatRoute(slug, dm.id) : serverAgentDmRoute(slug, agentId);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    const rowRef = React.useMemo(
        () => mergeRefs<HTMLDivElement>(focusRef, pressRef),
        [focusRef, pressRef]
    );
    if (!agent) {
        return null;
    }
    const unreadCount = dm?.unreadCount ?? 0;

    return (
        <Sidebar.MenuItem
            href={href}
            id={`agent-dm:${agentId}`}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
            textValue={agent.displayName}
        >
            <DmNavigationContextMenu
                agentId={agentId}
                chatId={dm?.id ?? null}
                chatName={agent.displayName}
                href={href}
                slug={slug}
            >
                <Sidebar.MenuIcon>
                    <LiveAgentAvatar agent={agent} serverId={serverId} size={24} />
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
