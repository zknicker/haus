import { Sidebar } from '@heroui-pro/react';
import { Tooltip } from '@heroui/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { serverChatRoute, taskRoute } from '../servers/server-routes.ts';
import { ChatNavigationContextMenu } from '../shell/chat-navigation-context-menu.tsx';
import { DmNavigationContextMenu } from '../shell/dm-navigation-context-menu.tsx';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../tasks/task-state.ts';
import type { ProjectRow } from './sidebar-model.ts';
import { useOpenTaskRow, usePersonRow, useProjectRow } from './use-capy-sidebar-rows.ts';

interface RowProps {
    isCurrent: boolean;
    serverId: string;
    slug: string;
}

export const ProjectNavigationRow = React.memo(function ProjectNavigationRow({
    chatId,
    isCurrent,
    serverId,
    slug,
}: RowProps & { chatId: string }) {
    const row = useProjectRow(serverId, chatId);
    const href = serverChatRoute(slug, chatId);
    const { preload, rowRef } = useRowNavigation(serverId, chatId, href);
    if (!row) {
        return null;
    }
    return (
        <Sidebar.MenuItem
            href={href}
            id={chatId}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
            textValue={row.name}
        >
            <ChatNavigationContextMenu
                chat={projectEntry(row, serverId)}
                isCurrent={isCurrent}
                slug={slug}
            >
                <Sidebar.MenuIcon>
                    <ChannelIconBox color={row.color} icon={row.icon} size="sidebar" />
                </Sidebar.MenuIcon>
                <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel
                        className={cn(
                            'ms-[2px]',
                            row.unreadCount > 0 && 'text-foreground font-medium'
                        )}
                    >
                        {row.name}
                    </Sidebar.MenuLabel>
                    {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
                </Sidebar.MenuItemContent>
            </ChatNavigationContextMenu>
        </Sidebar.MenuItem>
    );
});

export const OpenTaskNavigationRow = React.memo(function OpenTaskNavigationRow({
    isCurrent,
    serverId,
    slug,
    taskId,
}: RowProps & { taskId: string }) {
    const row = useOpenTaskRow(serverId, taskId);
    const href = row ? taskRoute(slug, row.key) : '';
    const { preload, rowRef } = useRowNavigation(serverId, row?.chatId ?? undefined, href);
    if (!row) {
        return null;
    }
    return (
        <Sidebar.MenuItem
            href={href}
            id={taskId}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
            textValue={`${row.key} ${row.title}`}
        >
            <Sidebar.MenuIcon>
                <span aria-label={taskStateLabels[row.state]} role="img">
                    <TaskStateDisc state={row.state} />
                </span>
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel
                    className={cn(row.unreadCount > 0 && 'text-foreground font-medium')}
                >
                    {row.waitingOnYou ? (
                        <WaitingOnYouKey taskKey={row.key} />
                    ) : (
                        <span className="text-muted me-1.5 tabular-nums">{row.key}</span>
                    )}
                    {row.title}
                </Sidebar.MenuLabel>
                {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
});

export const PersonNavigationRow = React.memo(function PersonNavigationRow({
    chatId,
    isCurrent,
    serverId,
    slug,
}: RowProps & { chatId: string }) {
    const row = usePersonRow(serverId, chatId);
    const href = serverChatRoute(slug, chatId);
    const { preload, rowRef } = useRowNavigation(serverId, chatId, href);
    if (!row) {
        return null;
    }
    return (
        <Sidebar.MenuItem
            href={href}
            id={chatId}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
            textValue={row.name}
        >
            <DmNavigationContextMenu
                agentId={null}
                chatId={chatId}
                chatName="DM"
                href={href}
                slug={slug}
            >
                <Sidebar.MenuIcon>
                    <EntityAvatar name={row.name} size={24} src={row.avatarUrl} />
                </Sidebar.MenuIcon>
                <Sidebar.MenuItemContent>
                    <Sidebar.MenuLabel
                        className={cn(
                            'ms-[2px]',
                            row.unreadCount > 0 && 'text-foreground font-medium'
                        )}
                    >
                        {row.name}
                    </Sidebar.MenuLabel>
                    {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
                </Sidebar.MenuItemContent>
            </DmNavigationContextMenu>
        </Sidebar.MenuItem>
    );
});

function WaitingOnYouKey({ taskKey }: { taskKey: string }) {
    return (
        <Tooltip delay={400}>
            <Tooltip.Trigger
                className="pointer-events-auto me-1.5 inline-flex items-center gap-1"
                role="presentation"
                tabIndex={-1}
            >
                <span className="sr-only">Waiting on you, </span>
                <span aria-hidden="true" className="bg-accent size-1.5 rounded-full" />
                <span className="text-accent tabular-nums">{taskKey}</span>
            </Tooltip.Trigger>
            <Tooltip.Content>Waiting on you</Tooltip.Content>
        </Tooltip>
    );
}

function useRowNavigation(serverId: string, chatId: string | undefined, href: string) {
    const { focusRef, preload } = usePreloadChat(serverId, chatId);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    const rowRef = React.useMemo(
        () => mergeRefs<HTMLDivElement>(focusRef, pressRef),
        [focusRef, pressRef]
    );
    return { preload, rowRef };
}

function projectEntry(row: ProjectRow, serverId: string) {
    return {
        color: row.color,
        icon: row.icon,
        id: row.chatId,
        kind: 'channel' as const,
        name: row.name,
        peerAgentDisplayName: null,
        peerAgentId: null,
        serverId,
        unreadCount: row.unreadCount,
    };
}
