import type { RepoFolderState } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { useState } from 'react';
import {
    useComputerRepoFolderStates,
    useComputerRepoFolders,
} from '../../hooks/servers/use-computer-repo-folders.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { ComputerRepoFolderAddDialog } from './computer-repo-folder-add-dialog.tsx';
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
    const [isAdding, setIsAdding] = useState(false);

    if (!computer) {
        return null;
    }

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Repositories</ItemCardGroup.Title>
                    {folders.data?.canAdd ? (
                        <Button
                            isDisabled={!isOnline}
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
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>No repo folders</ItemCard.Title>
                                </ItemCard.Content>
                            </ItemCard>
                        ) : (
                            folders.data.folders.map((folder) => (
                                <ComputerRepoFolderRow
                                    canRemove={folders.data.canRemove}
                                    folder={folder}
                                    key={folder.repository}
                                    state={folderState(reported, folder.path)}
                                    target={target}
                                />
                            ))
                        )}
                    </ItemCardGroup>
                ) : folders.isError ? (
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Repositories unavailable</ItemCard.Title>
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
            {isAdding ? (
                <ComputerRepoFolderAddDialog onClose={() => setIsAdding(false)} target={target} />
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
