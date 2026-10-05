import type { Chat } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    Delete02Icon,
    Edit02Icon,
    PaintBrush03Icon,
    UserCircleIcon,
    UserMultiple02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { ChatContextSurfaceItems } from './chat-surface-items.tsx';
import type { ChannelActions } from './use-channel-actions.tsx';

/**
 * A channel's commands as context-menu items, in the topbar menu's order: the
 * channel itself, its content, then its lifecycle. Render inside a
 * `ContextMenu.Menu` whose `onAction` runs `actions.run`.
 */
export function ChannelContextMenuItems({
    actions,
    chat,
}: {
    actions: ChannelActions;
    chat: Chat;
}) {
    const archived = Boolean(chat.archivedAt);
    const count = chat.participantAgentIds.length + chat.participantUserIds.length;
    return (
        <>
            <ContextMenu.Item id="rename" isDisabled={archived} textValue="Rename channel">
                <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                <Label>Rename channel</Label>
            </ContextMenu.Item>
            <ContextMenu.Item id="appearance" isDisabled={archived} textValue="Icon and color">
                <Icon aria-hidden="true" icon={PaintBrush03Icon} size={16} />
                <Label>Icon &amp; color…</Label>
            </ContextMenu.Item>
            <ContextMenu.Item id="agents" isDisabled={archived} textValue="Agents">
                <Icon aria-hidden="true" icon={UserMultiple02Icon} size={16} />
                <Label>Agents</Label>
                <span className="ms-auto shrink-0 text-muted text-xs tabular-nums">{count}</span>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ChatContextSurfaceItems files={actions.filesAvailable} />
            {chat.isAll || !actions.canManage ? null : (
                <>
                    <ContextMenu.Separator />
                    <ContextMenu.Item
                        id={archived ? 'restore' : 'archive'}
                        isDisabled={actions.lifecyclePending}
                        textValue={archived ? 'Restore channel' : 'Archive channel'}
                    >
                        <Icon
                            aria-hidden="true"
                            icon={archived ? ArchiveRestoreIcon : ArchiveIcon}
                            size={16}
                        />
                        <Label>{archived ? 'Restore channel' : 'Archive channel'}</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        id="delete"
                        isDisabled={actions.lifecyclePending}
                        textValue="Delete channel"
                        variant="danger"
                    >
                        <Icon aria-hidden="true" icon={Delete02Icon} size={16} />
                        <Label>Delete channel</Label>
                    </ContextMenu.Item>
                </>
            )}
        </>
    );
}

/** A DM's commands as context-menu items: its Agent, then its content. */
export function DmContextMenuItems({
    files,
    hasAgent,
    hasChat,
}: {
    files: boolean;
    hasAgent: boolean;
    hasChat: boolean;
}) {
    return (
        <>
            <ContextMenu.Item id="profile" isDisabled={!hasAgent} textValue="View agent profile">
                <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                <Label>View agent profile</Label>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ChatContextSurfaceItems files={files} isDisabled={!hasChat} />
        </>
    );
}
