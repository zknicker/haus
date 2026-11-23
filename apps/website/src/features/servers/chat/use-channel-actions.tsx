import type { Chat } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import {
    useChannelArchive,
    useChannelDelete,
    useChannelUnarchive,
} from '../../../hooks/servers/use-channel-lifecycle.ts';
import { useServer } from '../../../hooks/servers/use-server.ts';
import { projectRefusalCode } from '../../../lib/project-homes.ts';
import { DeleteDialog } from '../../../routes/app/delete-dialog.tsx';
import { ChannelAppearanceDialog } from '../../chats/channel-appearance-dialog.tsx';
import { ChannelDetailsDialog } from '../../chats/channel-details-dialog.tsx';
import {
    type ProjectRehomeAction,
    ProjectRehomeDialog,
} from '../../chats/project-rehome-dialog.tsx';

/** Where a chat menu's links go; each surface places them its own way. */
export interface ChatActionRoutes {
    /** The chat's Attachments. Omitted where a surface cannot open them, which hides the item. */
    openFiles?: (chatId: string) => void;
}

export interface ChannelActions {
    canManage: boolean;
    /** Mount next to the menu, outside its popover: the dialogs outlive the menu. */
    dialogs: React.ReactNode;
    filesAvailable: boolean;
    lifecyclePending: boolean;
    run: (chat: Chat, key: React.Key) => void;
}

// A Project's settings live on its Settings page; `#all`, which is no
// Project and has no page, keeps these two small dialogs.
type ChannelEditDialog = 'appearance' | 'rename';

/**
 * Every channel menu's actions — the web topbar's •••, the sidebar row, and
 * a desktop tab — run through here, so each surface lists the same commands
 * and they behave the same. `run` takes the chat, so one menu can serve
 * whichever row or tab it opened on.
 */
export function useChannelActions({
    onDeleted,
    openFiles,
    openSettings,
    slug,
}: ChatActionRoutes & {
    onDeleted?: (chat: Chat) => void;
    /** The Project's page in Settings, where every Project setting lives. */
    openSettings: (chatId: string) => void;
    slug: string;
}): ChannelActions {
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
    const [rehoming, setRehoming] = React.useState<{
        action: ProjectRehomeAction;
        chat: Chat;
    } | null>(null);

    const archiveProject = (chat: Chat) =>
        archive
            .mutateAsync({ chatId: chat.id, serverId: chat.serverId })
            .then(() => toast.success('Project archived'));
    const deleteProject = (chat: Chat) =>
        deleteChannel
            .mutateAsync({
                chatId: chat.id,
                confirmation: chat.name ?? '',
                serverId: chat.serverId,
            })
            .then(() => onDeleted?.(chat));

    const run = (chat: Chat, key: React.Key) => {
        if (key === 'files') {
            openFiles?.(chat.id);
            return;
        }
        if (key === 'settings') {
            openSettings(chat.id);
            return;
        }
        if (key === 'rename' || key === 'appearance') {
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
        const lifecycle =
            key === 'restore'
                ? unarchive
                      .mutateAsync({ chatId: chat.id, serverId: chat.serverId })
                      .then(() => toast.success('Project restored'))
                : archiveProject(chat);
        lifecycle.catch((error: Error) => {
            if (projectRefusalCode(error) === 'PROJECT_HAS_AGENTS') {
                setRehoming({ action: 'archive', chat });
                return;
            }
            toast.danger('Project update failed', { description: error.message });
        });
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
            {rehoming ? (
                <ProjectRehomeDialog
                    action={rehoming.action}
                    chat={rehoming.chat}
                    onClose={() => setRehoming(null)}
                    onContinue={() =>
                        rehoming.action === 'archive'
                            ? archiveProject(rehoming.chat)
                            : deleteProject(rehoming.chat)
                    }
                />
            ) : null}
            {deleting ? (
                <DeleteDialog
                    confirmation={deleting.name ?? ''}
                    description="This permanently deletes the project, its messages, claims, reminders, reactions, and attachments. This cannot be undone."
                    error={deleteChannel.error?.message}
                    onConfirm={() => {
                        deleteProject(deleting)
                            .then(() => setDeleting(null))
                            .catch((error: unknown) => {
                                if (projectRefusalCode(error) === 'PROJECT_HAS_AGENTS') {
                                    setDeleting(null);
                                    setRehoming({ action: 'delete', chat: deleting });
                                }
                            });
                    }}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) {
                            setDeleting(null);
                        }
                    }}
                    pending={deleteChannel.isPending}
                    title="Delete project"
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
