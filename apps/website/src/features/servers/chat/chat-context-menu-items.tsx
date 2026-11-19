import type { Chat } from '@haus/api';
import { ContextMenu } from '@heroui-pro/react';
import { Label } from '@heroui/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    Delete02Icon,
    Edit02Icon,
    PaintBrush03Icon,
    UserCircleIcon,
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
    return (
        <>
            <ContextMenu.Item id="rename" isDisabled={archived} textValue="Name and description">
                <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                <Label>Name &amp; description…</Label>
            </ContextMenu.Item>
            <ContextMenu.Item id="appearance" isDisabled={archived} textValue="Icon and color">
                <Icon aria-hidden="true" icon={PaintBrush03Icon} size={16} />
                <Label>Icon &amp; color…</Label>
            </ContextMenu.Item>
            {actions.filesAvailable ? (
                <>
                    <ContextMenu.Separator />
                    <ChatContextSurfaceItems />
                </>
            ) : null}
            {chat.isAll || !actions.canManage ? null : (
                <>
                    <ContextMenu.Separator />
                    <ContextMenu.Item
                        id={archived ? 'restore' : 'archive'}
                        isDisabled={actions.lifecyclePending}
                        textValue={archived ? 'Restore project' : 'Archive project'}
                    >
                        <Icon
                            aria-hidden="true"
                            icon={archived ? ArchiveRestoreIcon : ArchiveIcon}
                            size={16}
                        />
                        <Label>{archived ? 'Restore project' : 'Archive project'}</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                        id="delete"
                        isDisabled={actions.lifecyclePending}
                        textValue="Delete project"
                        variant="danger"
                    >
                        <Icon aria-hidden="true" icon={Delete02Icon} size={16} />
                        <Label>Delete project</Label>
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
            <ContextMenu.Item id="profile" isDisabled={!hasAgent} textValue="View Captain profile">
                <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                <Label>View Captain profile</Label>
            </ContextMenu.Item>
            {files ? (
                <>
                    <ContextMenu.Separator />
                    <ChatContextSurfaceItems isDisabled={!hasChat} />
                </>
            ) : null}
        </>
    );
}
