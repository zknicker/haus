import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopPageOpeners } from '../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { DmContextMenuItems } from '../servers/chat/chat-context-menu-items.tsx';
import { useDmActions } from '../servers/chat/use-dm-actions.ts';
import { OpenInNewTabItem, openInNewTabKey, useOpenInNewTab } from './open-in-new-tab-item.tsx';

/**
 * A DM row's right-click menu: open it, then every DM action the chat's own
 * menu has (Files only on desktop, which opens them as a page).
 */
export function DmNavigationContextMenu({
    agentId,
    chatId,
    chatName,
    children,
    href,
    slug,
}: {
    agentId: string | null;
    chatId: string | null;
    chatName: string;
    children: React.ReactNode;
    href: string;
    slug: string;
}) {
    const navigate = useSidebarNavigate();
    const actions = useDmActions({
        openFiles: useDesktopPageOpeners()?.openFiles,
        openPath: navigate,
        slug,
    });
    const openInNewTab = useOpenInNewTab();
    const onAction = (key: React.Key) => {
        if (key === 'open') {
            navigate(href);
            return;
        }
        if (key === openInNewTabKey) {
            openInNewTab?.(href);
            return;
        }
        actions.run({ agentId, chatId }, key);
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="flex min-w-0 flex-1 items-center gap-3">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item id="open" textValue={`Open ${chatName}`}>
                        <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                        <Label>Open chat</Label>
                    </ContextMenu.Item>
                    {openInNewTab ? <OpenInNewTabItem /> : null}
                    <ContextMenu.Separator />
                    <DmContextMenuItems
                        files={actions.filesAvailable}
                        hasAgent={agentId !== null}
                        hasChat={Boolean(chatId)}
                    />
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
