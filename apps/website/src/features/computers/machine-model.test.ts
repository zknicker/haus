import { expect, test } from 'bun:test';
import {
    type MachineDevice,
    machineChangeText,
    machineOptions,
    pendingMachineText,
} from './machine-model.ts';

const device = (id: string, name: string, overrides: Partial<MachineDevice> = {}) =>
    ({
        agentAccessGrants: [],
        agentAccessScope: 'selected',
        architecture: 'arm64',
        attachedByCurrentUser: false,
        health: 'healthy',
        id,
        name,
        operatingSystem: 'darwin',
        ...overrides,
    }) satisfies MachineDevice;

test('a Captain may move only to its Machine, a Device that allows it, or one the viewer attached', () => {
    const options = machineOptions({
        agentId: 'agt_cove',
        currentId: 'cmp_mini',
        devices: [
            device('cmp_mini', 'Mac mini'),
            device('cmp_granted', 'Studio', {
                agentAccessGrants: [{ agentId: 'agt_cove' }],
                health: 'offline',
            }),
            device('cmp_everyone', 'Shared', { agentAccessScope: 'all' }),
            device('cmp_mine', 'Zach’s MacBook Pro', { attachedByCurrentUser: true }),
            device('cmp_other', 'Ada’s MacBook', {
                agentAccessGrants: [{ agentId: 'agt_peer' }],
            }),
        ],
    });

    expect(options).toEqual([
        { id: 'cmp_mini', label: 'Mac mini', online: true },
        { id: 'cmp_granted', label: 'Studio', online: false },
        { id: 'cmp_everyone', label: 'Shared', online: true },
        { id: 'cmp_mine', label: 'Zach’s MacBook Pro', online: true },
    ]);
});

test('the confirmation names every chat and the worktrees left behind, or the offline choice', () => {
    const to = 'Zach’s MacBook Pro';
    expect(
        machineChangeText({
            agent: 'Cove',
            from: { id: 'cmp_mini', label: 'Mac mini', online: true },
            to,
        })
    ).toBe(
        'Cove will use Zach’s MacBook Pro for its tools in every chat from its next turn. Worktrees and uncommitted work stay on Mac mini.'
    );
    expect(
        machineChangeText({
            agent: 'Cove',
            from: { id: 'cmp_mini', label: 'Mac mini', online: false },
            to,
        })
    ).toBe(
        'Mac mini is offline. Move now and Cove uses Zach’s MacBook Pro from its next turn, starting from its last synced Drive: edits Mac mini hasn’t pushed stay there, and Haus won’t merge them. Or wait, and Cove moves once Mac mini is back and has pushed. Worktrees and uncommitted work stay on Mac mini.'
    );
});

test('a pending change says what it waits for', () => {
    const move = { from: 'Mac mini', to: 'Studio' };
    expect(pendingMachineText({ ...move, waitingFor: 'turn' })).toBe(
        'Moving to Studio when this turn ends.'
    );
    expect(pendingMachineText({ ...move, waitingFor: 'drive' })).toBe(
        'Moving to Studio once Mac mini pushes its Drive folder.'
    );
    expect(pendingMachineText({ ...move, waitingFor: 'machine' })).toBe(
        'Moving to Studio when Mac mini is back online.'
    );
});
