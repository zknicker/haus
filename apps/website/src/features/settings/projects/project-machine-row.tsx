import type { Project } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useProjectDefaultMachine } from '../../../hooks/projects/use-project-default-machine.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { computerLabel } from '../../computers/presentation.ts';
import { SettingsRowError } from '../layout/settings-text.tsx';
import { noDefaultMachineKey, projectMachineOptions } from './project-machine-options.ts';

export function ProjectMachineRow({
    isDisabled,
    project,
}: {
    isDisabled: boolean;
    project: Project;
}) {
    const computers = useComputers(project.serverId);
    const setMachine = useProjectDefaultMachine();
    const options = projectMachineOptions(
        project.defaultMachine,
        (computers.data ?? []).map((computer) => ({
            id: computer.id,
            label: computerLabel(computer),
        }))
    );

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Default Machine</ItemCard.Title>
                <ItemCard.Description>Used when a Task starts without one.</ItemCard.Description>
                <SettingsRowError>{setMachine.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <Select
                    aria-label="Default Machine for Tasks"
                    className="w-64 max-w-full"
                    isDisabled={isDisabled || setMachine.isPending}
                    onChange={(key) => {
                        setMachine.mutate({
                            computerId: key === noDefaultMachineKey ? null : String(key),
                            projectId: project.chatId,
                            serverId: project.serverId,
                        });
                    }}
                    value={project.defaultMachine?.computerId ?? noDefaultMachineKey}
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
