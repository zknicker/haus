import { ListView } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { ArchiveIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { useArchivedChats } from '../../../hooks/servers/use-archived-chats.ts';
import { useChannelUnarchive } from '../../../hooks/servers/use-channel-lifecycle.ts';
import type { ServerSummary } from '../../../lib/haus-server.tsx';
import { SettingsEmptyState } from '../../settings/layout/settings-empty.tsx';
import { SettingsPageColumn } from '../../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../../settings/layout/settings-page-header.tsx';
import { serverChatRoute } from '../server-routes.ts';

export function ArchivedChatsPage({
    server,
}: {
    server: Pick<ServerSummary, 'id' | 'role' | 'slug'>;
}) {
    const navigate = useNavigate();
    const chats = useArchivedChats(server.id);
    const unarchive = useChannelUnarchive();
    const canManage = server.role === 'owner' || server.role === 'admin';
    const items = chats.data ?? [];

    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Archived chats" />
            {chats.isPending ? (
                <div aria-busy="true" className="min-h-32">
                    <span className="sr-only">Loading archived chats</span>
                </div>
            ) : items.length === 0 ? (
                <SettingsEmptyState
                    description="Archived chats stay readable and can be restored here."
                    icon={ArchiveIcon}
                    title="No archived chats"
                />
            ) : (
                <ListView
                    aria-label="Archived chats"
                    items={items}
                    onAction={(key) => navigate(serverChatRoute(server.slug, String(key)))}
                    variant="secondary"
                >
                    {(chat) => (
                        <ListView.Item id={chat.id} textValue={chat.name ?? 'channel'}>
                            <ListView.ItemContent>
                                <ChannelIconBox color={chat.color} icon={chat.icon} size="topbar" />
                                <div className="flex min-w-0 flex-col">
                                    <ListView.Title>#{chat.name}</ListView.Title>
                                    <ListView.Description>
                                        Archived {formatArchivedAt(chat.archivedAt)}
                                    </ListView.Description>
                                </div>
                            </ListView.ItemContent>
                            {canManage ? (
                                <ListView.ItemAction>
                                    <Button
                                        isPending={
                                            unarchive.isPending &&
                                            unarchive.variables?.chatId === chat.id
                                        }
                                        onPress={() =>
                                            unarchive.mutate({
                                                chatId: chat.id,
                                                serverId: chat.serverId,
                                            })
                                        }
                                        size="sm"
                                        variant="secondary"
                                    >
                                        Restore
                                    </Button>
                                </ListView.ItemAction>
                            ) : null}
                        </ListView.Item>
                    )}
                </ListView>
            )}
            {chats.error || unarchive.error ? (
                <p className="text-danger text-sm" role="alert">
                    {chats.error?.message ?? unarchive.error?.message}
                </p>
            ) : null}
        </SettingsPageColumn>
    );
}

function formatArchivedAt(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
        : 'recently';
}
