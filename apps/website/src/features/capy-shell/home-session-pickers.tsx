import { InlineSelect } from '@heroui-pro/react';
import { Label, ListBox } from '@heroui/react';
import { AiBrain01Icon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../hooks/servers/use-model-connections.ts';
import { computerLabel } from '../computers/presentation.ts';
import { agentModelOptions } from '../members/agent-model-options.ts';

export interface HomeChoice {
    id: string;
    label: string;
}

export function useHomeMachines(serverId: string, projectId: string | undefined) {
    const computers = useComputers(serverId).data;
    const projects = useProjects(serverId).data;
    return React.useMemo(() => {
        const machines = (computers ?? []).map((computer) => ({
            id: computer.id,
            label: computerLabel(computer),
        }));
        const place = projects?.find((project) => project.chatId === projectId)?.defaultWorkerPlace;
        const preferred = place?.kind === 'computer' ? place.computerId : null;
        const fallback =
            machines.find((machine) => machine.id === preferred) ?? machines[0] ?? null;
        return { fallback, machines };
    }, [computers, projectId, projects]);
}

export function useHomeModels(serverId: string) {
    const read = useModelConnections(serverId).data;
    return React.useMemo(() => {
        const models = agentModelOptions(read?.runnerModels ?? [], read?.connections ?? null)
            .filter((option) => option.connected)
            .map((option) => ({ id: option.model.id, label: option.label }))
            .filter(
                (option, index, all) => all.findIndex((other) => other.id === option.id) === index
            );
        return { fallback: models[0] ?? null, models };
    }, [read]);
}

export function HomeMachinePicker({
    machine,
    machines,
    onChange,
}: {
    machine: HomeChoice | null;
    machines: readonly HomeChoice[];
    onChange: (id: string) => void;
}) {
    return (
        <HomeChoicePicker
            choices={machines}
            empty="No Machine attached"
            icon={LaptopIcon}
            label="Machine"
            onChange={onChange}
            selected={machine}
        />
    );
}

export function HomeModelPicker({
    model,
    models,
    onChange,
}: {
    model: HomeChoice | null;
    models: readonly HomeChoice[];
    onChange: (id: string) => void;
}) {
    return (
        <HomeChoicePicker
            choices={models}
            empty="No model connected"
            icon={AiBrain01Icon}
            label="Model"
            onChange={onChange}
            selected={model}
        />
    );
}

function HomeChoicePicker({
    choices,
    empty,
    icon,
    label,
    onChange,
    selected,
}: {
    choices: readonly HomeChoice[];
    empty: string;
    icon: typeof LaptopIcon;
    label: string;
    onChange: (id: string) => void;
    selected: HomeChoice | null;
}) {
    return (
        <InlineSelect
            aria-label={label}
            isDisabled={choices.length === 0}
            onChange={(next) => {
                if (next !== null) {
                    onChange(String(next));
                }
            }}
            value={selected?.id ?? null}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <Icon aria-hidden="true" className="text-muted" icon={icon} size={15} />
                <InlineSelect.Value>{() => selected?.label ?? empty}</InlineSelect.Value>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-64" placement="bottom start">
                <ListBox>
                    {choices.map((choice) => (
                        <ListBox.Item id={choice.id} key={choice.id} textValue={choice.label}>
                            <Label>{choice.label}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
