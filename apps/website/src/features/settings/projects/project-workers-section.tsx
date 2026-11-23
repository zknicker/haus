import type { Project } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useProjectWorkerPlace } from '../../../hooks/projects/use-project-worker-place.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { computerLabel } from '../../computers/presentation.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { workerPlaceFromKey, workerPlaceKey, workerPlaceOptions } from './worker-place-options.ts';

export function ProjectWorkersSection({
    isDisabled,
    project,
}: {
    isDisabled: boolean;
    project: Project;
}) {
    const computers = useComputers(project.serverId);
    const setPlace = useProjectWorkerPlace();
    const devices = (computers.data ?? []).map((computer) => ({
        id: computer.id,
        label: computerLabel(computer),
        workersEnabled: computer.workersEnabled,
    }));
    const options = workerPlaceOptions(project.defaultWorkerPlace, devices);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Workers</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <SettingsRowTitle info="A Captain's Worker runs here unless the Captain names a place. A Device is listed once “Run Workers here” is on for it.">
                            Default place
                        </SettingsRowTitle>
                        <SettingsRowError>{setPlace.error?.message}</SettingsRowError>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Select
                            aria-label="Default place for Workers"
                            className="w-48"
                            isDisabled={isDisabled || setPlace.isPending}
                            onChange={(key) => {
                                const place = workerPlaceFromKey(String(key));
                                if (place !== undefined) {
                                    setPlace.mutate({
                                        place,
                                        projectId: project.chatId,
                                        serverId: project.serverId,
                                    });
                                }
                            }}
                            value={workerPlaceKey(project.defaultWorkerPlace)}
                            variant="secondary"
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {options.map((option) => (
                                        <ListBox.Item
                                            id={option.id}
                                            key={option.id}
                                            textValue={option.label}
                                        >
                                            <Label>{option.label}</Label>
                                            <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Select.Popover>
                        </Select>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
