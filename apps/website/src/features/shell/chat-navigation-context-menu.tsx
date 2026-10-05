import type { Agent, Chat } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { ChannelContextMenuItems } from '../servers/chat/chat-context-menu-items.tsx';
import { useChannelActions } from '../servers/chat/use-channel-actions.tsx';
import { serverChatRoute, serverRoute } from '../servers/server-routes.ts';
import { DmNavigationContextMenu } from './dm-navigation-context-menu.tsx';
import { OpenInNewTabItem, openInNewTabKey, useOpenInNewTab } from './open-in-new-tab-item.tsx';

/**
 * A chat row's right-click menu: open it, then every action the chat's own
 * menu has. On desktop this (with the tab's menu) is where a chat's actions
 * live; its page carries no actions band.
 */
export function ChatNavigationContextMenu({
    agent,
    chat,
    children,
    isCurrent,
    slug,
}: {
    agent: Agent | null;
    chat: Chat;
    children: React.ReactNode;
    isCurrent: boolean;
    slug: string;
}) {
    if (chat.kind === 'dm') {
        return (
            <DmNavigationContextMenu
                agent={agent}
                chatId={chat.id}
                chatName={agent?.displayName ?? chat.peerAgentDisplayName ?? 'DM'}
                href={serverChatRoute(slug, chat.id)}
                slug={slug}
            >
                {children}
            </DmNavigationContextMenu>
        );
    }
    return (
        <ChannelNavigationContextMenu chat={chat} isCurrent={isCurrent} slug={slug}>
            {children}
        </ChannelNavigationContextMenu>
    );
}

function ChannelNavigationContextMenu({
    chat,
    children,
    isCurrent,
    slug,
}: {
    chat: Chat;
    children: React.ReactNode;
    isCurrent: boolean;
    slug: string;
}) {
    const navigate = useNavigate();
    const actions = useChannelActions({
        // Deleting the channel you are in leaves it; any other page stays put.
        onDeleted: isCurrent ? () => navigate(serverRoute(slug), { replace: true }) : undefined,
        openFiles: useDesktopPageOpeners()?.openFiles,
        slug,
    });
    const openInNewTab = useOpenInNewTab();
    const chatName = chat.name ?? 'channel';
    const onAction = (key: React.Key) => {
        if (key === 'open') {
            navigate(serverChatRoute(slug, chat.id));
            return;
        }
        if (key === openInNewTabKey) {
            openInNewTab?.(serverChatRoute(slug, chat.id));
            return;
        }
        actions.run(chat, key);
    };

    return (
        <>
            <ContextMenu>
                {/* The trigger wraps Sidebar's icon and content slots, so it owns their stock gap. */}
                <ContextMenu.Trigger className="flex min-w-0 flex-1 items-center gap-3">
                    {children}
                </ContextMenu.Trigger>
                <ContextMenu.Popover>
                    <ContextMenu.Menu onAction={onAction}>
                        {/* A row's first menu item echoes what clicking it does;
                            the chat's own commands follow in their usual order. */}
                        <ContextMenu.Item id="open" textValue={`Open ${chatName}`}>
                            <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                            <Label>Open channel</Label>
                        </ContextMenu.Item>
                        {openInNewTab ? <OpenInNewTabItem /> : null}
                        <ContextMenu.Separator />
                        <ChannelContextMenuItems actions={actions} chat={chat} />
                    </ContextMenu.Menu>
                </ContextMenu.Popover>
            </ContextMenu>
            {actions.dialogs}
        </>
    );
}
