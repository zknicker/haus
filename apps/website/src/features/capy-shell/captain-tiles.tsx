import { Badge, Tooltip } from '@heroui/react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { ChatGroup } from '../shell/chat-navigation-group.tsx';
import { useCaptainTile } from './use-capy-sidebar-rows.ts';

const tileAvatarSize = 34;
const tileSize = 44;

export function CaptainTiles({
    agentDmChatIds,
    agentIds,
    selectedAgentDmId,
    selectedChatId,
    serverId,
    slug,
}: {
    agentDmChatIds: Readonly<Record<string, string>>;
    agentIds: readonly string[];
    selectedAgentDmId: string | undefined;
    selectedChatId: string | undefined;
    serverId: string;
    slug: string;
}) {
    return (
        <ChatGroup label="Captains">
            <ul aria-label="Captains" className="flex flex-wrap gap-x-0.5 ps-[2px]">
                {agentIds.map((agentId) => (
                    <li key={agentId}>
                        <CaptainTileLink
                            agentId={agentId}
                            isCurrent={
                                agentId === selectedAgentDmId ||
                                (selectedChatId !== undefined &&
                                    agentDmChatIds[agentId] === selectedChatId)
                            }
                            key={agentId}
                            serverId={serverId}
                            slug={slug}
                        />
                    </li>
                ))}
            </ul>
        </ChatGroup>
    );
}

const CaptainTileLink = React.memo(function CaptainTileLink({
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
    const tile = useCaptainTile(serverId, agentId);
    const dmChatId = tile?.dmChatId ?? undefined;
    const { preload } = usePreloadChat(serverId, dmChatId);
    const href = dmChatId ? serverChatRoute(slug, dmChatId) : serverAgentDmRoute(slug, agentId);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    if (!tile) {
        return null;
    }
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
                        'hover:bg-default flex cursor-[var(--cursor-interactive)] items-center justify-center rounded-xl',
                        isCurrent && 'bg-default'
                    )}
                    onFocus={preload}
                    onMouseEnter={preload}
                    ref={pressRef}
                    style={{ height: tileSize, width: tileSize }}
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
