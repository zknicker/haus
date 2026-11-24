import { Sidebar } from '@heroui-pro/react';
import { Tooltip } from '@heroui/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { useHover } from 'react-aria';
import { UnreadDot } from '../../components/chats/unread-dot.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { serverChatRoute, taskRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from '../shell/dm-navigation-context-menu.tsx';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../tasks/task-state.ts';
import { TaskNavigationContextMenu } from './task-navigation-context-menu.tsx';
import { useOpenTaskRow, usePersonRow } from './use-capy-sidebar-rows.ts';

interface RowProps {
    isCurrent: boolean;
    serverId: string;
    slug: string;
}

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
            <TaskNavigationContextMenu href={href} serverId={serverId} taskId={taskId}>
                <Sidebar.MenuIcon>
                    <span aria-label={taskStateLabels[row.state]} role="img">
                        <TaskStateDisc className="size-[18px]" state={row.state} />
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
                    <UnreadDot count={row.unreadCount} />
                </Sidebar.MenuItemContent>
            </TaskNavigationContextMenu>
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
                chatName={row.name}
                href={href}
                peer="person"
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
                    <UnreadDot count={row.unreadCount} />
                </Sidebar.MenuItemContent>
            </DmNavigationContextMenu>
        </Sidebar.MenuItem>
    );
});

function WaitingOnYouKey({ taskKey }: { taskKey: string }) {
    const keyRef = React.useRef<HTMLSpanElement>(null);
    const [isOpen, setOpen] = React.useState(false);
    const { hoverProps } = useHover({ onHoverChange: setOpen });
    return (
        <Tooltip isOpen={isOpen} onOpenChange={setOpen}>
            <span
                {...hoverProps}
                className="pointer-events-auto me-1.5 inline-flex items-center gap-1"
                ref={keyRef}
            >
                <span className="sr-only">Waiting on you, </span>
                <span aria-hidden="true" className="bg-accent size-1.5 rounded-full" />
                <span className="text-accent tabular-nums">{taskKey}</span>
            </span>
            <Tooltip.Content triggerRef={keyRef}>Waiting on you</Tooltip.Content>
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
