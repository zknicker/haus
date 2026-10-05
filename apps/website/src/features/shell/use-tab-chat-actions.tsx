import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { BubbleChatIcon, HashtagIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { filesPagePath } from '../../routes/app/desktop-page-paths.ts';
import {
    ChannelContextMenuItems,
    DmContextMenuItems,
} from '../servers/chat/chat-context-menu-items.tsx';
import { useChannelActions } from '../servers/chat/use-channel-actions.tsx';
import { useDmActions } from '../servers/chat/use-dm-actions.ts';
import { parseTabPage } from './tab-identity.ts';
import { useDesktopShell } from './use-tab-navigator.ts';

/**
 * A chat tab's own actions for the tab row's menu, under one Channel or DM
 * submenu: the same commands as the sidebar row, so a desktop chat page needs
 * no actions band. Links open from
 * the tab, as they would from inside its page. `items` is null for a tab that
 * is not a chat; `dialogs` mount beside the menu, since they outlive it.
 */
export function useTabChatActions(tabId: string | null) {
    const tabs = useDesktopTabs();
    const { server } = useDesktopShell();
    const chats = useChats(server.id);
    const agents = useAgents(server.id);
    // The tab an action ran on; the menu's target clears as the menu closes.
    const actionTab = React.useRef<string | null>(null);
    const openPath = (path: string) => {
        if (actionTab.current) {
            tabs.openLink(actionTab.current, { kind: 'app', path }, 'auto');
        }
    };
    const openFiles = (chatId: string) => openPath(filesPagePath(server.slug, chatId));
    const deletedTab = React.useRef<string | null>(null);
    const channel = useChannelActions({
        onDeleted: () => {
            if (deletedTab.current) {
                tabs.close([deletedTab.current]);
            }
        },
        openFiles,
        openPath,
        slug: server.slug,
    });
    const dm = useDmActions({ openFiles, openPath, slug: server.slug });

    const tab = tabId ? tabs.tab(tabId) : null;
    const page = tab ? parseTabPage(currentLocation(tab)) : null;
    const chat =
        page?.kind === 'chat' ? (chats.data?.find(({ id }) => id === page.chatId) ?? null) : null;
    const agentId = page?.kind === 'dm' ? page.agentId : chat?.peerAgentId;
    const agent = agentId ? (agents.data?.find(({ id }) => id === agentId) ?? null) : null;

    const onAction = (key: React.Key) => {
        actionTab.current = tabId;
        if (key === 'delete') {
            deletedTab.current = tabId;
        }
        if (chat?.kind === 'channel') {
            channel.run(chat, key);
        } else if (chat || page?.kind === 'dm') {
            dm.run({ agent, chatId: chat?.id ?? null }, key);
        }
    };

    let items: React.ReactNode = null;
    if (chat?.kind === 'channel') {
        items = <ChannelContextMenuItems actions={channel} chat={chat} />;
    } else if (chat || page?.kind === 'dm') {
        items = <DmContextMenuItems files hasAgent={Boolean(agent)} hasChat={Boolean(chat)} />;
    }
    const label = chat?.kind === 'channel' ? 'Channel' : 'DM';

    return {
        dialogs: channel.dialogs,
        items: items ? (
            <>
                <ContextMenu.Separator />
                <ContextMenu.SubmenuTrigger>
                    <ContextMenu.Item id="chat" textValue={label}>
                        <Icon
                            aria-hidden="true"
                            icon={chat?.kind === 'channel' ? HashtagIcon : BubbleChatIcon}
                            size={16}
                        />
                        <Label>{label}</Label>
                        <ContextMenu.SubmenuIndicator />
                    </ContextMenu.Item>
                    <ContextMenu.Popover>
                        <ContextMenu.Menu onAction={onAction}>{items}</ContextMenu.Menu>
                    </ContextMenu.Popover>
                </ContextMenu.SubmenuTrigger>
            </>
        ) : null,
        onAction,
    };
}
