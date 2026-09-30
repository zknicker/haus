import type { Chat } from '@haus/api';
import { Button, Dropdown, Label, Tooltip, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    ColorsIcon,
    Delete02Icon,
    Edit02Icon,
    MoreHorizontalIcon,
    PaintBrush03Icon,
    UserMultiple02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { channelColorOptions } from '../../../components/chats/channel-color-options.ts';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    useChannelArchive,
    useChannelDelete,
    useChannelUnarchive,
} from '../../../hooks/servers/use-channel-lifecycle.ts';
import { useChannelUpdate } from '../../../hooks/servers/use-channel-update.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { DeleteDialog } from '../../../routes/app/delete-dialog.tsx';
import { ChannelAgentsDialog } from '../../chats/channel-agents-dialog.tsx';
import { ChannelAppearanceDialog } from '../../chats/channel-appearance-dialog.tsx';
import { ChannelRenameDialog } from '../../chats/channel-rename-dialog.tsx';
import { serverRoute, tasksRoute } from '../server-routes.ts';
import { ChannelActionsMenu } from './channel-actions-menu.tsx';
import { ChatContextSurfaceItems } from './chat-surface-items.tsx';

// Editing a channel is three separate decisions, so each one gets its own
// small dialog instead of one dialog that asks for everything at once.
type ChannelEditDialog = 'agents' | 'appearance' | 'rename';
const channelColorPrefix = 'color:';

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
    const archive = useChannelArchive();
    const unarchive = useChannelUnarchive();
    const deleteChannel = useChannelDelete();
    const updateChannel = useChannelUpdate();
    const [editDialog, setEditDialog] = React.useState<ChannelEditDialog | null>(null);
    const [confirmingDelete, setConfirmingDelete] = React.useState(false);
    const count = chat.participantAgentIds.length + chat.participantUserIds.length;

    // Everyone can reach participants; only managers can reshape the channel.
    const canManage = server.role === 'owner' || server.role === 'admin';
    const lifecyclePending = archive.isPending || unarchive.isPending || deleteChannel.isPending;
    const runLifecycleAction = (key: React.Key) => {
        if (key === 'tasks') {
            navigate(`${tasksRoute(server.slug)}?chat=${encodeURIComponent(chat.id)}`);
            return;
        }
        if (key === 'files') {
            onOpenFiles();
            return;
        }
        if (key === 'rename' || key === 'appearance' || key === 'agents') {
            setEditDialog(key);
            return;
        }
        if (key === 'delete') {
            deleteChannel.reset();
            setConfirmingDelete(true);
            return;
        }
        if (typeof key === 'string' && key.startsWith(channelColorPrefix)) {
            updateChannel
                .mutateAsync({
                    agentIds: chat.participantAgentIds,
                    chatId: chat.id,
                    color: key.slice(channelColorPrefix.length),
                    icon: chat.icon,
                    name: chat.name ?? '',
                    serverId: chat.serverId,
                })
                .then(() => toast.success('Channel color updated'))
                .catch((error: Error) =>
                    toast.danger('Channel update failed', { description: error.message })
                );
            return;
        }
        const mutation = key === 'restore' ? unarchive : archive;
        mutation
            .mutateAsync({ chatId: chat.id, serverId: chat.serverId })
            .then(() => toast.success(key === 'restore' ? 'Channel restored' : 'Channel archived'))
            .catch((error: Error) =>
                toast.danger('Channel update failed', { description: error.message })
            );
    };

    const closeEditDialog = () => setEditDialog(null);

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
                                canManage={canManage}
                                chat={chat}
                                count={count}
                                lifecyclePending={lifecyclePending}
                                onAction={runLifecycleAction}
                            />
                        </Dropdown.Popover>
                    </Dropdown>
                </ContextMenu.Trigger>
                <ContextMenu.Popover>
                    <ContextMenu.Menu onAction={runLifecycleAction}>
                        <ContextMenu.Item
                            id="rename"
                            isDisabled={Boolean(chat.archivedAt)}
                            textValue="Rename channel"
                        >
                            <Icon aria-hidden="true" icon={Edit02Icon} size={16} />
                            <Label>Rename channel</Label>
                        </ContextMenu.Item>
                        <ContextMenu.Item
                            id="appearance"
                            isDisabled={Boolean(chat.archivedAt)}
                            textValue="Icon and color"
                        >
                            <Icon aria-hidden="true" icon={PaintBrush03Icon} size={16} />
                            <Label>Icon &amp; color…</Label>
                        </ContextMenu.Item>
                        <ContextMenu.SubmenuTrigger>
                            <ContextMenu.Item
                                id="color"
                                isDisabled={Boolean(chat.archivedAt) || updateChannel.isPending}
                                textValue="Color"
                            >
                                <Icon aria-hidden="true" icon={ColorsIcon} size={16} />
                                <Label>Color</Label>
                                <ContextMenu.SubmenuIndicator />
                            </ContextMenu.Item>
                            <ContextMenu.Popover>
                                <ContextMenu.Menu onAction={runLifecycleAction}>
                                    {channelColorOptions.map((option) => (
                                        <ContextMenu.Item
                                            id={`${channelColorPrefix}${option.id}`}
                                            key={option.id}
                                            textValue={option.label}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="size-4 rounded-full"
                                                style={{ backgroundColor: option.value }}
                                            />
                                            <Label>{option.label}</Label>
                                            {chat.color === option.id ? (
                                                <ContextMenu.ItemIndicator />
                                            ) : null}
                                        </ContextMenu.Item>
                                    ))}
                                </ContextMenu.Menu>
                            </ContextMenu.Popover>
                        </ContextMenu.SubmenuTrigger>
                        <ContextMenu.Item
                            id="agents"
                            isDisabled={Boolean(chat.archivedAt)}
                            textValue="Agents"
                        >
                            <Icon aria-hidden="true" icon={UserMultiple02Icon} size={16} />
                            <Label>Agents</Label>
                            <span className="ms-auto shrink-0 text-muted text-xs tabular-nums">
                                {count}
                            </span>
                        </ContextMenu.Item>
                        <ContextMenu.Separator />
                        <ChatContextSurfaceItems />
                        {chat.isAll || !canManage ? null : (
                            <>
                                <ContextMenu.Separator />
                                <ContextMenu.Item
                                    id={chat.archivedAt ? 'restore' : 'archive'}
                                    isDisabled={lifecyclePending}
                                    textValue={
                                        chat.archivedAt ? 'Restore channel' : 'Archive channel'
                                    }
                                >
                                    <Icon
                                        icon={chat.archivedAt ? ArchiveRestoreIcon : ArchiveIcon}
                                        size={16}
                                    />
                                    <Label>
                                        {chat.archivedAt ? 'Restore channel' : 'Archive channel'}
                                    </Label>
                                </ContextMenu.Item>
                                <ContextMenu.Item
                                    id="delete"
                                    isDisabled={lifecyclePending}
                                    textValue="Delete channel"
                                    variant="danger"
                                >
                                    <Icon icon={Delete02Icon} size={16} />
                                    <Label>Delete channel</Label>
                                </ContextMenu.Item>
                            </>
                        )}
                    </ContextMenu.Menu>
                </ContextMenu.Popover>
            </ContextMenu>
            {/* Each edit dialog mounts on demand, so its draft starts from the
                channel as it is right now. */}
            {editDialog === 'rename' ? (
                <ChannelRenameDialog chat={chat} onClose={closeEditDialog} />
            ) : null}
            {editDialog === 'appearance' ? (
                <ChannelAppearanceDialog chat={chat} onClose={closeEditDialog} />
            ) : null}
            {editDialog === 'agents' ? (
                <ChannelAgentsDialog chat={chat} onClose={closeEditDialog} />
            ) : null}
            {confirmingDelete ? (
                <DeleteDialog
                    confirmation={chat.name ?? ''}
                    description="This permanently deletes the channel, its messages, threads, tasks, reminders, reactions, and attachments. This cannot be undone."
                    error={deleteChannel.error?.message}
                    onConfirm={() => {
                        deleteChannel
                            .mutateAsync({
                                chatId: chat.id,
                                confirmation: chat.name ?? '',
                                serverId: chat.serverId,
                            })
                            .then(() => {
                                setConfirmingDelete(false);
                                navigate(serverRoute(server.slug), { replace: true });
                            })
                            .catch(() => undefined);
                    }}
                    onOpenChange={setConfirmingDelete}
                    pending={deleteChannel.isPending}
                    title="Delete Channel"
                />
            ) : null}
        </>
    );
}
