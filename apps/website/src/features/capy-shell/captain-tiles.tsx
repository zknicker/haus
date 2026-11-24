import { HoverCard } from '@heroui-pro/react';
import { Badge } from '@heroui/react';
import * as React from 'react';
import { Link } from 'react-aria-components';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { usePreloadAgentRecord } from '../../hooks/members/use-preload-agent-profile.ts';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { AgentHoverCardContent } from '../members/agent-hover-card.tsx';
import { serverAgentDmRoute, serverChatRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from '../shell/dm-navigation-context-menu.tsx';
import { CapySection } from './capy-section.tsx';
import type { CaptainPresence } from './sidebar-model.ts';
import { useCaptainTile } from './use-capy-sidebar-rows.ts';

const tileAvatarSize = 38;
const tileSize = tileAvatarSize + 6;

export function CaptainTiles({
    action,
    agentDmChatIds,
    agentIds,
    selectedAgentDmId,
    selectedChatId,
    serverId,
    slug,
}: {
    action?: React.ReactNode;
    agentDmChatIds: Readonly<Record<string, string>>;
    agentIds: readonly string[];
    selectedAgentDmId: string | undefined;
    selectedChatId: string | undefined;
    serverId: string;
    slug: string;
}) {
    return (
        <CapySection action={action} label="Captains">
            {agentIds.length > 0 ? (
                <ul
                    aria-label="Captains"
                    className="grid grid-cols-[repeat(auto-fill,var(--captain-tile))] justify-between gap-y-0.5"
                    style={{ '--captain-tile': `${tileSize}px` } as React.CSSProperties}
                >
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
            ) : null}
        </CapySection>
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
    const { preload: preloadChat } = usePreloadChat(serverId, dmChatId);
    const preloadAgent = usePreloadAgentRecord(serverId, agentId);
    const preload = React.useCallback(() => {
        preloadChat();
        preloadAgent();
    }, [preloadAgent, preloadChat]);
    const href = dmChatId ? serverChatRoute(slug, dmChatId) : serverAgentDmRoute(slug, agentId);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    const [cardOffset, setCardOffset] = React.useState(cardGap);
    if (!tile) {
        return null;
    }
    const label = [
        tile.name,
        tile.presence ? presenceLabels[tile.presence] : null,
        tile.unreadCount > 0 ? `${tile.unreadCount} unread` : null,
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <DmNavigationContextMenu
            agentId={agentId}
            chatId={tile.dmChatId}
            chatName={tile.name}
            href={href}
            layout="tile"
            slug={slug}
        >
            <HoverCard closeDelay={150} openDelay={400}>
                <HoverCard.Trigger
                    className="block"
                    onPointerEnter={(event) =>
                        setCardOffset(offsetPastSidebar(event.currentTarget))
                    }
                >
                    <Link
                        aria-current={isCurrent ? 'page' : undefined}
                        aria-label={label}
                        className={cn(
                            'hover:bg-default flex cursor-[var(--cursor-interactive)] flex-col items-center gap-1 rounded-xl pt-1.5 pb-1.25',
                            isCurrent && 'bg-default'
                        )}
                        href={href}
                        onFocus={preload}
                        onHoverStart={preload}
                        ref={pressRef}
                        style={{ width: tileSize }}
                    >
                        <Badge.Anchor style={{ height: tileAvatarSize, width: tileAvatarSize }}>
                            <EntityAvatar
                                name={tile.name}
                                size={tileAvatarSize}
                                src={tile.avatarUrl}
                            />
                            {tile.unreadCount > 0 ? (
                                <Badge className="tabular-nums" color="accent" size="sm">
                                    {tile.unreadCount > 99 ? '99+' : tile.unreadCount}
                                </Badge>
                            ) : null}
                            {tile.presence ? (
                                <Badge
                                    color={presenceBadgeColors[tile.presence]}
                                    data-agent-status={tile.presence}
                                    placement="bottom-right"
                                    size="sm"
                                />
                            ) : null}
                        </Badge.Anchor>
                        <span
                            aria-hidden="true"
                            className="text-muted w-full truncate px-0.5 text-center text-xs leading-tight"
                        >
                            {tile.name}
                        </span>
                    </Link>
                </HoverCard.Trigger>
                <HoverCard.Content
                    aria-label={tile.name}
                    className="haus-hover-card haus-hover-card--themed haus-hover-card--sectioned w-max max-w-none"
                    offset={cardOffset}
                    placement="right top"
                >
                    <AgentHoverCardContent
                        agentId={agentId}
                        agentName={tile.name}
                        serverId={serverId}
                    />
                </HoverCard.Content>
            </HoverCard>
        </DmNavigationContextMenu>
    );
});

const presenceLabels = {
    error: 'needs attention',
    paused: 'paused',
    working: 'working',
} as const satisfies Record<CaptainPresence, string>;

const presenceBadgeColors = {
    error: 'danger',
    paused: 'default',
    working: 'warning',
} as const satisfies Record<CaptainPresence, string>;

const cardGap = 8;

function offsetPastSidebar(tile: HTMLElement) {
    const grid = tile.closest('ul');
    if (!grid) {
        return cardGap;
    }
    return grid.getBoundingClientRect().right - tile.getBoundingClientRect().right + cardGap * 3;
}
