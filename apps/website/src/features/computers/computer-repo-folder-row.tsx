import type { RepoFolder, RepoFolderState, RepoGithubAccessStatus } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Dropdown, Label, toast } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useRepos } from '../../hooks/repos/use-repos.ts';
import {
    type RepoFolderTarget,
    useRemoveRepoFolder,
} from '../../hooks/servers/use-computer-repo-folders.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { SettingsAttention } from '../settings/layout/settings-row-title.tsx';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { folderStateLabels, repoAccessChips } from '../settings/repos/repo-access.ts';

export function ComputerRepoFolderRow({
    canRemove,
    folder,
    state,
    target,
}: {
    canRemove: boolean;
    folder: RepoFolder;
    state: RepoFolderState | null;
    target: RepoFolderTarget;
}) {
    const remove = useRemoveRepoFolder(target);
    const access = useRepos(target.serverId).data?.repos.find(
        (repo) => repo.repository === folder.repository
    )?.githubAccess;
    const issue = folderIssue(state, access?.status ?? null);
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>
                    <span title={folder.path}>{folder.path}</span>
                </ItemCard.Title>
                <ItemCard.Description>
                    {folder.addedBy ? folder.repository : `${folder.repository}, Haus’s own clone`}
                </ItemCard.Description>
                {issue ? (
                    <SettingsAttention color={issue.color}>{issue.label}</SettingsAttention>
                ) : null}
                <SettingsRowError>{remove.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <Dropdown>
                    <Button
                        aria-label={`${folder.repository} actions`}
                        isIconOnly
                        isPending={remove.isPending}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu
                            onAction={(key) => {
                                if (key === 'copy') {
                                    void copyPath(folder.path);
                                }
                                if (key === 'remove') {
                                    remove.mutate({ ...target, repository: folder.repository });
                                }
                            }}
                        >
                            <Dropdown.Item id="copy" textValue="Copy path">
                                <Label>Copy path</Label>
                            </Dropdown.Item>
                            {canRemove ? (
                                <Dropdown.Item
                                    id="remove"
                                    isDisabled={remove.isPending}
                                    textValue="Remove"
                                    variant="danger"
                                >
                                    <Label>Remove</Label>
                                </Dropdown.Item>
                            ) : null}
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            </ItemCard.Action>
        </ItemCard>
    );
}

async function copyPath(path: string) {
    try {
        await writeClipboardText(path);
        toast.success('Path copied');
    } catch (error) {
        toast.danger('Could not copy the path', {
            description: error instanceof Error ? error.message : undefined,
        });
    }
}

function folderIssue(state: RepoFolderState | null, access: RepoGithubAccessStatus | null) {
    if (state && state !== 'present') {
        return { color: 'warning', label: capitalize(folderStateLabels[state]) } as const;
    }
    if (access && access !== 'ready') {
        return repoAccessChips[access];
    }
    return null;
}

function capitalize(label: string) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}
