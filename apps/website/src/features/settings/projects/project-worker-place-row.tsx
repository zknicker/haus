import type { Project } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useProjectWorkerPlace } from '../../../hooks/projects/use-project-worker-place.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { computerLabel } from '../../computers/presentation.ts';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { workerPlaceFromKey, workerPlaceKey, workerPlaceOptions } from './worker-place-options.ts';

export function ProjectWorkerPlaceRow({
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
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Worker place</ItemCard.Title>
                <ItemCard.Description>Used when a Captain doesn’t name one.</ItemCard.Description>
                <SettingsRowError>{setPlace.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <Select
                    aria-label="Default place for Workers"
                    className="w-64 max-w-full"
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
    );
}
