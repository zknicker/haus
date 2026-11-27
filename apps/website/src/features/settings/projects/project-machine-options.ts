import type { Project } from '@haus/api';

export const noDefaultMachineKey = 'none';

export interface ProjectMachineOption {
    id: string;
    label: string;
}

export function projectMachineOptions(
    current: Project['defaultMachine'],
    machines: readonly ProjectMachineOption[]
) {
    const options: ProjectMachineOption[] = [
        { id: noDefaultMachineKey, label: noDefaultLabel },
        ...machines,
    ];
    return current === null || options.some((option) => option.id === current.computerId)
        ? options
        : [...options, { id: current.computerId, label: projectMachineLabel(current) }];
}

export function projectMachineLabel(machine: Project['defaultMachine']) {
    if (machine === null) {
        return noDefaultLabel;
    }
    return machine.computerName ?? 'Device';
}

const noDefaultLabel = 'No default';
