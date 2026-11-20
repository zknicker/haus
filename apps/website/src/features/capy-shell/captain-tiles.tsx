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
        <ChatGroup action={action} label="Captains">
            <ul aria-label="Captains" className="flex flex-wrap gap-x-0.5 gap-y-[2px] ps-[2px]">
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
    const name = useTruncation(tile?.name);
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
        <Tooltip delay={400} isDisabled={!name.truncated}>
            <Tooltip.Trigger role="presentation" tabIndex={-1}>
                <Link
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={label}
                    className={cn(
                        'hover:bg-default flex cursor-[var(--cursor-interactive)] flex-col items-center gap-[3px] rounded-xl pt-[5px] pb-[4px]',
                        isCurrent && 'bg-default'
                    )}
                    onFocus={preload}
                    onMouseEnter={preload}
                    ref={pressRef}
                    style={{ width: tileSize }}
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
                    <span
                        aria-hidden="true"
                        className="text-muted w-full truncate px-[2px] text-center text-xs leading-tight"
                        ref={name.ref}
                    >
                        {tile.name}
                    </span>
                </Link>
            </Tooltip.Trigger>
            <Tooltip.Content>{tile.name}</Tooltip.Content>
        </Tooltip>
    );
});

function useTruncation(text: string | undefined) {
    const ref = React.useRef<HTMLSpanElement>(null);
    const [truncated, setTruncated] = React.useState(false);
    React.useLayoutEffect(() => {
        const element = ref.current;
        setTruncated(
            element !== null && text !== undefined && element.scrollWidth > element.clientWidth
        );
    }, [text]);
    return { ref, truncated };
}
