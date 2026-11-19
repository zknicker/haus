import { Sidebar } from '@heroui-pro/react';
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
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../tasks/task-state.ts';
import {
    type CaptainTile,
    type OpenTaskRow,
    type PersonRow,
    type ProjectRow,
    progressLineParts,
} from './sidebar-model.ts';

const projectCaptainLimit = 3;

export function ProjectNavigationRow({
    captains,
    currentPath,
    row,
    serverId,
    slug,
}: {
    captains: ReadonlyMap<string, CaptainTile>;
    currentPath: string;
    row: ProjectRow;
    serverId: string;
    slug: string;
}) {
    const href = serverChatRoute(slug, row.chatId);
    const isCurrent = currentPath === href;
    const { preload, rowRef } = useRowNavigation(serverId, row.chatId, href);
    const faces = row.captainIds.value
        .flatMap((id) => captains.get(id) ?? [])
        .slice(0, projectCaptainLimit);
    return (
        <Sidebar.MenuItem
            data-captains-source={row.captainIds.source}
            href={href}
            id={row.chatId}
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
                    {faces.length > 0 ? (
                        <span aria-hidden="true" className="flex shrink-0 -space-x-1">
                            {faces.map((captain) => (
                                <EntityAvatar
                                    key={captain.agentId}
                                    name={captain.name}
                                    size={16}
                                    src={captain.avatarUrl}
                                />
                            ))}
                        </span>
                    ) : null}
                    {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
                </Sidebar.MenuItemContent>
            </ChatNavigationContextMenu>
        </Sidebar.MenuItem>
    );
}

export function OpenTaskNavigationRow({
    currentPath,
    row,
    serverId,
    slug,
}: {
    currentPath: string;
    row: OpenTaskRow;
    serverId: string;
    slug: string;
}) {
    const href = taskRoute(slug, row.key);
    const { preload, rowRef } = useRowNavigation(serverId, row.chatId ?? undefined, href);
    return (
        <Sidebar.MenuItem
            href={href}
            id={row.taskId}
            isCurrent={currentPath === href}
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
                <span className="flex min-w-0 flex-1 flex-col py-1">
                    <Sidebar.MenuLabel
                        className={cn(row.unreadCount > 0 && 'text-foreground font-medium')}
                    >
                        <span className="text-muted me-1.5 tabular-nums">{row.key}</span>
                        {row.title}
                    </Sidebar.MenuLabel>
                    <OpenTaskLineText line={row.line} />
                </span>
                {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

export function PersonNavigationRow({
    currentPath,
    row,
    serverId,
    slug,
}: {
    currentPath: string;
    row: PersonRow;
    serverId: string;
    slug: string;
}) {
    const href = serverChatRoute(slug, row.chatId);
    const { preload, rowRef } = useRowNavigation(serverId, row.chatId, href);
    return (
        <Sidebar.MenuItem
            href={href}
            id={row.chatId}
            isCurrent={currentPath === href}
            onHoverStart={preload}
            ref={rowRef}
            textValue={row.name}
        >
            <Sidebar.MenuIcon>
                <EntityAvatar name={row.name} size={20} src={row.avatarUrl} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel
                    className={cn('ms-[2px]', row.unreadCount > 0 && 'text-foreground font-medium')}
                >
                    {row.name}
                </Sidebar.MenuLabel>
                {row.unreadCount > 0 ? <UnreadCountChip count={row.unreadCount} /> : null}
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

function OpenTaskLineText({ line }: { line: OpenTaskRow['line'] }) {
    if (line.kind === 'waiting') {
        return <span className="text-accent truncate text-xs">waiting on {line.on}</span>;
    }
    const parts = progressLineParts(line);
    return parts.length > 0 ? (
        <span className="text-muted truncate text-xs" data-workers-source={line.workers.source}>
            {parts.join(' · ')}
        </span>
    ) : null;
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
