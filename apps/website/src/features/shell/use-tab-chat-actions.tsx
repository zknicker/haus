import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { BubbleChatIcon, HashtagIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import {
    useDesktopTabCommands,
    useDesktopTabsSelector,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useAgentMark } from '../../hooks/members/use-agents.ts';
import { useListedChat } from '../../hooks/servers/use-chats.ts';
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
 * The chat actions a tab row's menu runs, and the dialogs they open (mounted
 * beside the menu, since they outlive it). It reads no chat or tab state:
 * the menu body (`useTabChatMenu`) looks those up only while the menu is
 * open, so a closed menu does not re-render with every message or tab change.
 */
export function useTabChatActions() {
    const tabs = useDesktopTabCommands();
    const { server } = useDesktopShell();
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
    const beginAction = (tabId: string, key: React.Key) => {
        actionTab.current = tabId;
        if (key === 'delete') {
            deletedTab.current = tabId;
        }
    };
    return { beginAction, channel, dialogs: channel.dialogs, dm, serverId: server.id };
}

export type TabChatActions = ReturnType<typeof useTabChatActions>;

/**
 * A chat tab's own actions for the open tab menu, under one Channel or DM
 * submenu: the same commands as the sidebar row, so a desktop chat page needs
 * no actions band. Links open from the tab, as they would from inside its
 * page. `items` is null for a tab that is not a chat.
 */
export function useTabChatMenu(actions: TabChatActions, tabId: string | null) {
    const location = useDesktopTabsSelector((state) => {
        const tab = tabId ? state.tabs[tabId] : undefined;
        return tab ? currentLocation(tab) : null;
    });
    const page = location ? parseTabPage(location) : null;
    const chat = useListedChat(actions.serverId, page?.kind === 'chat' ? page.chatId : '') ?? null;
    const agentId = page?.kind === 'dm' ? page.agentId : chat?.peerAgentId;
    const agent = useAgentMark(actions.serverId, agentId ?? '') ?? null;

    const onAction = (key: React.Key) => {
        if (!tabId) {
            return;
        }
        actions.beginAction(tabId, key);
        if (chat?.kind === 'channel') {
            actions.channel.run(chat, key);
        } else if (chat || page?.kind === 'dm') {
            actions.dm.run({ agentId: agent?.id ?? null, chatId: chat?.id ?? null }, key);
        }
    };

    let items: React.ReactNode = null;
    if (chat?.kind === 'channel') {
        items = <ChannelContextMenuItems actions={actions.channel} chat={chat} />;
    } else if (chat || page?.kind === 'dm') {
        items = <DmContextMenuItems files hasAgent={Boolean(agent)} hasChat={Boolean(chat)} />;
    }
    const label = chat?.kind === 'channel' ? 'Channel' : 'DM';

    return {
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
