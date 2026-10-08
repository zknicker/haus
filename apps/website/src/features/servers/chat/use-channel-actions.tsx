import type { Chat } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChannelArchive,
    useChannelDelete,
    useChannelUnarchive,
} from '../../../hooks/servers/use-channel-lifecycle.ts';
import { useServer } from '../../../hooks/servers/use-server.ts';
import { DeleteDialog } from '../../../routes/app/delete-dialog.tsx';
import { ChannelAgentsDialog } from '../../chats/channel-agents-dialog.tsx';
import { ChannelAppearanceDialog } from '../../chats/channel-appearance-dialog.tsx';
import { ChannelDetailsDialog } from '../../chats/channel-details-dialog.tsx';
import { tasksRoute } from '../server-routes.ts';

/** Where a chat menu's links go; each surface places them its own way. */
export interface ChatActionRoutes {
    /** The chat's Files. Omitted where a surface cannot open them, which hides the item. */
    openFiles?: (chatId: string) => void;
    /** Tasks and profile links. Defaults to the surface's router. */
    openPath?: (path: string) => void;
}

export interface ChannelActions {
    canManage: boolean;
    /** Mount next to the menu, outside its popover: the dialogs outlive the menu. */
    dialogs: React.ReactNode;
    filesAvailable: boolean;
    lifecyclePending: boolean;
    run: (chat: Chat, key: React.Key) => void;
}

// Editing a channel is three separate decisions, so each one gets its own
// small dialog instead of one dialog that asks for everything at once.
type ChannelEditDialog = 'agents' | 'appearance' | 'rename';

/**
 * Every channel menu's actions — the web topbar's •••, the sidebar row, and
 * a desktop tab — run through here, so each surface lists the same commands
 * and they behave the same. `run` takes the chat, so one menu can serve
 * whichever row or tab it opened on.
 */
export function useChannelActions({
    onDeleted,
    openFiles,
    openPath,
    slug,
}: ChatActionRoutes & {
    onDeleted?: (chat: Chat) => void;
    slug: string;
}): ChannelActions {
    const navigate = useNavigate();
    const role = useServer(slug).data?.role;
    const archive = useChannelArchive();
    const unarchive = useChannelUnarchive();
    const deleteChannel = useChannelDelete();
    // Each dialog holds the chat it opened for: the menu that opened it may
    // already point somewhere else.
    const [editDialog, setEditDialog] = React.useState<{
        chat: Chat;
        kind: ChannelEditDialog;
    } | null>(null);
    const [deleting, setDeleting] = React.useState<Chat | null>(null);
    const open = openPath ?? navigate;

    const run = (chat: Chat, key: React.Key) => {
        if (key === 'tasks') {
            open(`${tasksRoute(slug)}?chat=${encodeURIComponent(chat.id)}`);
            return;
        }
        if (key === 'files') {
            openFiles?.(chat.id);
            return;
        }
        if (key === 'rename' || key === 'appearance' || key === 'agents') {
            setEditDialog({ chat, kind: key });
            return;
        }
        if (key === 'delete') {
            deleteChannel.reset();
            setDeleting(chat);
            return;
        }
        if (key !== 'archive' && key !== 'restore') {
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
    // Each edit dialog mounts on demand, so its draft starts from the channel
    // as it is right now.
    const dialogs = (
        <>
            {editDialog?.kind === 'rename' ? (
                <ChannelDetailsDialog chat={editDialog.chat} onClose={closeEditDialog} />
            ) : null}
            {editDialog?.kind === 'appearance' ? (
                <ChannelAppearanceDialog chat={editDialog.chat} onClose={closeEditDialog} />
            ) : null}
            {editDialog?.kind === 'agents' ? (
                <ChannelAgentsDialog chat={editDialog.chat} onClose={closeEditDialog} />
            ) : null}
            {deleting ? (
                <DeleteDialog
                    confirmation={deleting.name ?? ''}
                    description="This permanently deletes the channel, its messages, threads, tasks, reminders, reactions, and attachments. This cannot be undone."
                    error={deleteChannel.error?.message}
                    onConfirm={() => {
                        deleteChannel
                            .mutateAsync({
                                chatId: deleting.id,
                                confirmation: deleting.name ?? '',
                                serverId: deleting.serverId,
                            })
                            .then(() => {
                                setDeleting(null);
                                onDeleted?.(deleting);
                            })
                            .catch(() => undefined);
                    }}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) {
                            setDeleting(null);
                        }
                    }}
                    pending={deleteChannel.isPending}
                    title="Delete Channel"
                />
            ) : null}
        </>
    );

    return {
        // Everyone can reach participants; only managers can reshape the channel.
        canManage: role === 'owner' || role === 'admin',
        dialogs,
        filesAvailable: Boolean(openFiles),
        lifecyclePending: archive.isPending || unarchive.isPending || deleteChannel.isPending,
        run,
    };
}
