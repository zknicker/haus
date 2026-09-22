import type { Agent, Chat } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { cn } from '../../lib/utils.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { serverChatRoute } from '../servers/server-routes.ts';
import { ChatNavigationContextMenu } from './chat-navigation-context-menu.tsx';

export function ChatNavigationRow({
    agent,
    ariaDescribedBy,
    chat,
    className,
    name,
    onChangeChannelColor,
    ref,
    selectedChatId,
    slug,
    style,
}: {
    agent: Agent | null;
    ariaDescribedBy?: string;
    chat: Chat;
    className?: string;
    name: string;
    onChangeChannelColor?: (chat: Chat, color: string) => void;
    ref?: React.Ref<HTMLDivElement>;
    selectedChatId: string | undefined;
    slug: string;
    style?: React.CSSProperties;
}) {
    const { focusRef, preload } = usePreloadChat(chat.serverId, chat.id);
    const rowRef = React.useMemo(() => mergeRefs(ref, focusRef), [focusRef, ref]);
    return (
        <Sidebar.MenuItem
            aria-describedby={ariaDescribedBy}
            className={className}
            href={serverChatRoute(slug, chat.id)}
            id={chat.id}
            isCurrent={chat.id === selectedChatId}
            onHoverStart={preload}
            ref={rowRef}
            style={style}
            textValue={name}
        >
            <ChatNavigationContextMenu
                agent={agent}
                chat={chat}
                onChangeChannelColor={onChangeChannelColor}
                slug={slug}
            >
                <ChatNavigationRowContent agent={agent} chat={chat} name={name} />
            </ChatNavigationContextMenu>
        </Sidebar.MenuItem>
    );
}

export function ChatNavigationRowContent({
    agent,
    chat,
    name,
}: {
    agent: Agent | null;
    chat: Chat;
    name: string;
}) {
    return (
        <>
            <Sidebar.MenuIcon>
                <ChatIcon agent={agent} chat={chat} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                {/* Two optical pixels, not a spacing change: a chat's mark is a
                    filled box — a channel tile or an Agent avatar — where Search
                    and Tasks are line glyphs carrying their own internal
                    whitespace. At the same metric gap the filled mark reads
                    tighter against its label, so the label buys that back. A
                    literal px rather than a spacing step, because this corrects
                    for the mark's shape and must not move with density. It rides
                    here rather than on the row, because the row's gap belongs to
                    Sidebar and is shared with those glyph rows. */}
                <Sidebar.MenuLabel
                    className={cn(
                        'ms-[2px]',
                        chat.unreadCount > 0 && 'font-medium text-foreground'
                    )}
                >
                    {name}
                </Sidebar.MenuLabel>
                <ChatRowChip chat={chat} />
            </Sidebar.MenuItemContent>
        </>
    );
}

export function chatNavigationName(chat: Chat, agent: Agent | null): string {
    return chat.kind === 'channel'
        ? (chat.name ?? 'channel')
        : (agent?.displayName ?? chat.peerAgentDisplayName ?? 'DM');
}

function ChatRowChip({ chat }: { chat: Chat }) {
    if (chat.unreadCount === 0) {
        return null;
    }
    return <UnreadCountChip count={chat.unreadCount} />;
}

function ChatIcon({ agent, chat }: { agent: Agent | null; chat: Chat }) {
    if (!agent) {
        return <ChannelIconBox color={chat.color} icon={chat.icon} size="sidebar" />;
    }

    return <AgentAvatar agent={agent} size={24} />;
}
