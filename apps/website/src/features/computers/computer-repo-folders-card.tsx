import type { RepoFolderState } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import { Fragment, useState } from 'react';
import {
    useComputerRepoFolderStates,
    useComputerRepoFolders,
} from '../../hooks/servers/use-computer-repo-folders.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useServerList } from '../../hooks/servers/use-server-list.ts';
import { SettingsEmptyRow } from '../settings/layout/settings-empty.tsx';
import { AddRepoDialog } from '../settings/repos/add-repo-dialog.tsx';
import { ComputerRepoFolderRow } from './computer-repo-folder-row.tsx';

export function ComputerRepoFoldersCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const target = { computerId, serverId };
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const isOnline = computer
        ? computer.health !== 'offline' && computer.health !== 'update-required'
        : false;
    const folders = useComputerRepoFolders(target);
    const hasFolders = (folders.data?.folders.length ?? 0) > 0;
    const states = useComputerRepoFolderStates(target, isOnline && hasFolders);
    const reported = isOnline ? states.data?.states : undefined;
    const serverSlug = useServerList().data?.find((server) => server.id === serverId)?.slug;
    const [isAdding, setIsAdding] = useState(false);

    if (!computer) {
        return null;
    }

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Folders</ItemCardGroup.Title>
                    {folders.data?.canAdd ? (
                        <Button
                            isDisabled={!(isOnline && serverSlug)}
                            onPress={() => setIsAdding(true)}
                            size="sm"
                            variant="secondary"
                        >
                            Add folder
                        </Button>
                    ) : null}
                </ItemCardGroup.Header>
                {folders.data ? (
                    <ItemCardGroup>
                        {folders.data.folders.length === 0 ? (
                            <SettingsEmptyRow>No folders yet</SettingsEmptyRow>
                        ) : (
                            folders.data.folders.map((folder, index) => (
                                <Fragment key={folder.repository}>
                                    {index > 0 ? <Separator /> : null}
                                    <ComputerRepoFolderRow
                                        canRemove={folders.data.canRemove}
                                        folder={folder}
                                        state={folderState(reported, folder.path)}
                                        target={target}
                                    />
                                </Fragment>
                            ))
                        )}
                    </ItemCardGroup>
                ) : folders.isError ? (
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Folders unavailable</ItemCard.Title>
                                <ItemCard.Description>{folders.error.message}</ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    onPress={() => void folders.refetch()}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Try again
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                ) : null}
            </ItemCardGroup>
            {isAdding && serverSlug ? (
                <AddRepoDialog
                    computerId={computerId}
                    onClose={() => setIsAdding(false)}
                    serverId={serverId}
                    serverSlug={serverSlug}
                />
            ) : null}
        </section>
    );
}

function folderState(
    states: readonly { path: string; state: RepoFolderState }[] | undefined,
    path: string
) {
    return states?.find((candidate) => candidate.path === path)?.state ?? null;
}
