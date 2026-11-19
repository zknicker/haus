import { Sidebar } from '@heroui-pro/react';
import { Badge, Tooltip } from '@heroui/react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import type { CaptainTile } from './sidebar-model.ts';

const tileAvatarSize = 32;

export function CaptainTiles({
    currentPath,
    serverId,
    slug,
    tiles,
}: {
    currentPath: string;
    serverId: string;
    slug: string;
    tiles: readonly CaptainTile[];
}) {
    return (
        <Sidebar.Group>
            <Sidebar.GroupLabel>Captains</Sidebar.GroupLabel>
            <ul aria-label="Captains" className="flex flex-wrap gap-1 px-1">
                {tiles.map((tile) => {
                    const href = tile.dmChatId
                        ? serverChatRoute(slug, tile.dmChatId)
                        : serverAgentDmRoute(slug, tile.agentId);
                    return (
                        <li key={tile.agentId}>
                            <CaptainTileLink
                                href={href}
                                isCurrent={currentPath === href}
                                serverId={serverId}
                                tile={tile}
                            />
                        </li>
                    );
                })}
            </ul>
        </Sidebar.Group>
    );
}

const CaptainTileLink = React.memo(function CaptainTileLink({
    href,
    isCurrent,
    serverId,
    tile,
}: {
    href: string;
    isCurrent: boolean;
    serverId: string;
    tile: CaptainTile;
}) {
    const { preload } = usePreloadChat(serverId, tile.dmChatId ?? undefined);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    const label = [
        tile.name,
        tile.working ? 'working' : null,
        tile.unreadCount > 0 ? `${tile.unreadCount} unread` : null,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <Tooltip delay={400}>
            <Tooltip.Trigger role="presentation" tabIndex={-1}>
                <Link
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={label}
                    className={cn(
                        'hover:bg-default flex size-10 cursor-[var(--cursor-interactive)] items-center justify-center rounded-xl',
                        isCurrent && 'bg-default'
                    )}
                    onFocus={preload}
                    onMouseEnter={preload}
                    ref={pressRef}
                    to={href}
                >
                    <Badge.Anchor style={{ height: tileAvatarSize, width: tileAvatarSize }}>
                        <EntityAvatar name={tile.name} size={tileAvatarSize} src={tile.avatarUrl} />
                        {tile.unreadCount > 0 ? (
                            <Badge className="tabular-nums" color="accent" size="sm">
                                {tile.unreadCount > 99 ? '99+' : tile.unreadCount}
                            </Badge>
                        ) : null}
                        {tile.working ? (
                            <Badge
                                color="warning"
                                data-agent-status="working"
                                placement="bottom-right"
                                size="sm"
                            />
                        ) : null}
                    </Badge.Anchor>
                </Link>
            </Tooltip.Trigger>
            <Tooltip.Content>{tile.name}</Tooltip.Content>
        </Tooltip>
    );
});
