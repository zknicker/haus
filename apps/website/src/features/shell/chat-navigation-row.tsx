import { Sidebar } from '@heroui-pro/react';
import { mergeRefs } from '@react-aria/utils';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { type ChatNavigationEntry, useChatNavigationEntry } from '../../hooks/servers/use-chats.ts';
import { usePreloadChat } from '../../hooks/servers/use-preload-chat.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { cn } from '../../lib/utils.ts';
import { serverChatRoute } from '../servers/server-routes.ts';
import { ChatNavigationContextMenu } from './chat-navigation-context-menu.tsx';
import { chatNavigationName } from './chat-navigation-name.ts';

/**
 * One Chat in the sidebar. Memoized on its own list entry and a boolean
 * `isCurrent`: a navigation re-renders only the row it leaves and the row it
 * lands on, and a chat-list update only the rows whose entry changed. A plain
 * mouse press opens the Chat, even one that then drags to reorder; keyboard
 * and modified clicks keep the link's own path.
 */
export const ChatNavigationRow = React.memo(function ChatNavigationRow({
    ariaDescribedBy,
    chat,
    className,
    isCurrent,
    name,
    ref,
    slug,
    style,
}: {
    ariaDescribedBy?: string;
    chat: ChatNavigationEntry;
    className?: string;
    isCurrent: boolean;
    name: string;
    ref?: React.Ref<HTMLDivElement>;
    slug: string;
    style?: React.CSSProperties;
}) {
    const { focusRef, preload } = usePreloadChat(chat.serverId, chat.id);
    const href = serverChatRoute(slug, chat.id);
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, preload);
    const rowRef = React.useMemo(
        () => mergeRefs<HTMLDivElement>(ref, focusRef, pressRef),
        [focusRef, pressRef, ref]
    );
    return (
        <Sidebar.MenuItem
            aria-describedby={ariaDescribedBy}
            className={className}
            href={href}
            id={chat.id}
            isCurrent={isCurrent}
            onHoverStart={preload}
            ref={rowRef}
            style={style}
            textValue={name}
        >
            <ChatNavigationContextMenu chat={chat} isCurrent={isCurrent} slug={slug}>
                <ChatNavigationRowContent chat={chat} name={name} />
            </ChatNavigationContextMenu>
        </Sidebar.MenuItem>
    );
});

/** A DM with people: a Chat row that reads its own list entry. */
export const ListedChatNavigationRow = React.memo(function ListedChatNavigationRow({
    chatId,
    isCurrent,
    serverId,
    slug,
}: {
    chatId: string;
    isCurrent: boolean;
    serverId: string;
    slug: string;
}) {
    const chat = useChatNavigationEntry(serverId, chatId);
    if (!chat) {
        return null;
    }
    return (
        <ChatNavigationRow
            chat={chat}
            isCurrent={isCurrent}
            name={chatNavigationName(chat, null)}
            slug={slug}
        />
    );
});

export function ChatNavigationRowContent({
    chat,
    name,
}: {
    chat: ChatNavigationEntry;
    name: string;
}) {
    return (
        <>
            <Sidebar.MenuIcon>
                <ChannelIconBox color={chat.color} icon={chat.icon} size="sidebar" />
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
                {chat.unreadCount > 0 ? <UnreadCountChip count={chat.unreadCount} /> : null}
            </Sidebar.MenuItemContent>
        </>
    );
}
