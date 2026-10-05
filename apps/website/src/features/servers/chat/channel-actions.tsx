import type { Chat } from '@haus/api';
import { Button, Dropdown, Tooltip } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { serverRoute } from '../server-routes.ts';
import { ChannelActionsMenu } from './channel-actions-menu.tsx';
import { ChannelContextMenuItems } from './chat-context-menu-items.tsx';
import { useChannelActions } from './use-channel-actions.tsx';

/**
 * The web topbar's channel ••• menu (desktop moves these commands onto the
 * sidebar row's and the tab's context menus, so a chat tab needs no band).
 */
export function ChannelActions({
    chat,
    chatName,
    onOpenFiles,
    server,
}: {
    chat: Chat;
    chatName: string;
    onOpenFiles: () => void;
    server: ServerDetail;
}) {
    const navigate = useNavigate();
    const actions = useChannelActions({
        onDeleted: () => navigate(serverRoute(server.slug), { replace: true }),
        openFiles: onOpenFiles,
        slug: server.slug,
    });
    const onAction = (key: React.Key) => actions.run(chat, key);

    return (
        <>
            <ContextMenu>
                <ContextMenu.Trigger className="min-w-0">
                    <Dropdown>
                        <Tooltip>
                            <Button
                                aria-label={`${chatName} — channel actions`}
                                isIconOnly
                                size="sm"
                                variant="ghost"
                            >
                                <Icon
                                    aria-hidden="true"
                                    className="text-muted"
                                    icon={MoreHorizontalIcon}
                                    size={15}
                                />
                            </Button>
                            <Tooltip.Content>Channel actions</Tooltip.Content>
                        </Tooltip>
                        <Dropdown.Popover placement="bottom end">
                            <ChannelActionsMenu
                                canManage={actions.canManage}
                                chat={chat}
                                count={
                                    chat.participantAgentIds.length + chat.participantUserIds.length
                                }
                                lifecyclePending={actions.lifecyclePending}
                                onAction={onAction}
                            />
                        </Dropdown.Popover>
                    </Dropdown>
                </ContextMenu.Trigger>
                <ContextMenu.Popover>
                    <ContextMenu.Menu onAction={onAction}>
                        <ChannelContextMenuItems actions={actions} chat={chat} />
                    </ContextMenu.Menu>
                </ContextMenu.Popover>
            </ContextMenu>
            {actions.dialogs}
        </>
    );
}
