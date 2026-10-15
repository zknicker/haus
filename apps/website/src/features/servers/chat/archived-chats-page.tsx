import { Button } from '@heroui/react';
import { EmptyState, ListView } from '@heroui-pro/react';
import { ArchiveIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useArchivedChats } from '../../../hooks/servers/use-archived-chats.ts';
import { useChannelUnarchive } from '../../../hooks/servers/use-channel-lifecycle.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PageBand } from '../../shell/page-band.tsx';
import { serverChatRoute, serverSettingsRoute } from '../server-routes.ts';

export function ArchivedChatsPage({ server }: { server: ServerDetail }) {
    const navigate = useNavigate();
    const chats = useArchivedChats(server.id);
    const unarchive = useChannelUnarchive();
    const canManage = server.role === 'owner' || server.role === 'admin';
    const items = chats.data ?? [];

    return (
        <section aria-label="Archived channels" className="flex min-h-0 flex-1 flex-col">
            {/* The Settings rail links here, so the trail runs through Settings. */}
            <PageBand>
                <PageBand.Trail
                    crumbs={[{ href: serverSettingsRoute(server.slug), label: 'Settings' }]}
                    current="Archived chats"
                />
            </PageBand>
            <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto p-6 pt-8">
                {chats.isPending ? (
                    <div aria-busy="true" className="min-h-full">
                        <span className="sr-only">Loading archived channels</span>
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState>
                        <EmptyState.Header>
                            <EmptyState.Media variant="icon">
                                <Icon aria-hidden="true" icon={ArchiveIcon} />
                            </EmptyState.Media>
                            <EmptyState.Title>No archived channels</EmptyState.Title>
                            <EmptyState.Description>
                                Archived channels stay readable and can be restored here.
                            </EmptyState.Description>
                        </EmptyState.Header>
                    </EmptyState>
                ) : (
                    <ListView
                        aria-label="Archived channels"
                        items={items}
                        onAction={(key) => navigate(serverChatRoute(server.slug, String(key)))}
                        variant="secondary"
                    >
                        {(chat) => (
                            <ListView.Item id={chat.id} textValue={chat.name ?? 'channel'}>
                                <ListView.ItemContent>
                                    <Icon aria-hidden="true" icon={ArchiveIcon} />
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
                                            variant="outline"
                                        >
                                            Restore
                                        </Button>
                                    </ListView.ItemAction>
                                ) : null}
                            </ListView.Item>
                        )}
                    </ListView>
                )}
                {chats.error ? <p className="text-danger text-sm">{chats.error.message}</p> : null}
            </div>
        </section>
    );
}

function formatArchivedAt(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
        : 'recently';
}
