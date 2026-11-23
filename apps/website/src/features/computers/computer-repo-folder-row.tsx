import type { RepoFolder, RepoFolderState } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type RepoFolderTarget,
    useRemoveRepoFolder,
} from '../../hooks/servers/use-computer-repo-folders.ts';
import { SettingsFact, SettingsRowError } from '../settings/layout/settings-text.tsx';

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
    const chip = state ? stateChips[state] : null;
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>
                    {folder.repository}
                    {chip ? (
                        <Chip
                            className="ms-2 align-middle"
                            color="warning"
                            size="sm"
                            variant="soft"
                        >
                            {chip}
                        </Chip>
                    ) : null}
                </ItemCard.Title>
                <ItemCard.Description title={folder.path}>{folder.path}</ItemCard.Description>
                <SettingsRowError>{remove.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    <SettingsFact>{adderLabel(folder)}</SettingsFact>
                    {canRemove ? (
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
                                        if (key === 'remove') {
                                            remove.mutate({
                                                ...target,
                                                repository: folder.repository,
                                            });
                                        }
                                    }}
                                >
                                    <Dropdown.Item
                                        id="remove"
                                        isDisabled={remove.isPending}
                                        textValue="Remove folder"
                                        variant="danger"
                                    >
                                        <Label>Remove folder</Label>
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown>
                    ) : null}
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}

const stateChips = {
    missing: 'Missing',
    'other-origin': 'Different origin',
    present: null,
} as const satisfies Record<RepoFolderState, null | string>;

function adderLabel(folder: RepoFolder) {
    return folder.addedBy ? `Added by ${folder.addedBy.name}` : 'Haus clone';
}
