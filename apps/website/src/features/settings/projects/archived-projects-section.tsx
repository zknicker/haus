import type { Project } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import * as React from 'react';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { useArchivedChats } from '../../../hooks/servers/use-archived-chats.ts';
import { useChannelUnarchive } from '../../../hooks/servers/use-channel-lifecycle.ts';
import { SettingsRowError } from '../layout/settings-text.tsx';

export function ArchivedProjectsSection({
    canRestore,
    projects,
    serverId,
}: {
    canRestore: boolean;
    projects: readonly Project[];
    serverId: string;
}) {
    const chats = useArchivedChats(serverId).data;
    const unarchive = useChannelUnarchive();
    if (projects.length === 0) {
        return null;
    }

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    Archived
                    <span className="text-muted ms-2 tabular-nums">{projects.length}</span>
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                {projects.map((project, index) => {
                    const chat = chats?.find((candidate) => candidate.id === project.chatId);
                    const restoring =
                        unarchive.isPending && unarchive.variables?.chatId === project.chatId;
                    return (
                        <React.Fragment key={project.chatId}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <ChannelIconBox
                                    color={chat?.color ?? null}
                                    icon={chat?.icon ?? null}
                                    size="topbar"
                                />
                                <ItemCard.Content>
                                    <ItemCard.Title>#{project.name}</ItemCard.Title>
                                    <ItemCard.Description>
                                        Archived {formatArchivedAt(chat?.archivedAt ?? null)}
                                    </ItemCard.Description>
                                    {unarchive.variables?.chatId === project.chatId ? (
                                        <SettingsRowError>
                                            {unarchive.error?.message}
                                        </SettingsRowError>
                                    ) : null}
                                </ItemCard.Content>
                                {canRestore ? (
                                    <ItemCard.Action>
                                        <Button
                                            isPending={restoring}
                                            onPress={() =>
                                                unarchive.mutate({
                                                    chatId: project.chatId,
                                                    serverId,
                                                })
                                            }
                                            size="sm"
                                            variant="secondary"
                                        >
                                            Restore
                                        </Button>
                                    </ItemCard.Action>
                                ) : null}
                            </ItemCard>
                        </React.Fragment>
                    );
                })}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function formatArchivedAt(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
        : 'recently';
}
