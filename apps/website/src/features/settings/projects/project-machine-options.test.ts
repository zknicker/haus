import { expect, test } from 'bun:test';
import { projectMachineLabel, projectMachineOptions } from './project-machine-options.ts';

const machines = [
    { id: 'cmp_mini', label: 'Mini' },
    { id: 'cmp_studio', label: 'Studio' },
];

test('the options are No default, then every Machine', () => {
    expect(projectMachineOptions(null, machines)).toEqual([
        { id: 'none', label: 'No default' },
        ...machines,
    ]);
});

test('a default Machine the list no longer has keeps its own option', () => {
    expect(
        projectMachineOptions({ computerId: 'cmp_gone', computerName: 'Old laptop' }, machines).at(-1)
    ).toEqual({ id: 'cmp_gone', label: 'Old laptop' });
    expect(projectMachineLabel({ computerId: 'cmp_gone', computerName: null })).toBe('Device');
    expect(projectMachineLabel(null)).toBe('No default');
});
