import type { AgentMachineChange, AgentMachineWait, ComputerAgentAccessScope } from '@haus/api';
import { type ComputerPresentation, computerLabel } from './presentation.ts';

export interface MachineDevice extends ComputerPresentation {
    agentAccessGrants: readonly { agentId: string }[];
    agentAccessScope: ComputerAgentAccessScope;
    attachedByCurrentUser: boolean;
    health: string;
}

export interface MachineOption {
    id: string;
    label: string;
    online: boolean;
}

export function isDeviceOnline(health: string) {
    return health === 'healthy' || health === 'degraded';
}

export function machineOptions(input: {
    agentId: string;
    currentId: string;
    devices: readonly MachineDevice[];
}) {
    return input.devices
        .filter(
            (device) =>
                device.id === input.currentId ||
                device.agentAccessScope === 'all' ||
                device.attachedByCurrentUser ||
                device.agentAccessGrants.some((grant) => grant.agentId === input.agentId)
        )
        .map(
            (device) =>
                ({
                    id: device.id,
                    label: computerLabel(device),
                    online: isDeviceOnline(device.health),
                }) satisfies MachineOption
        );
}

export function machineChangeText(input: { agent: string; from: MachineOption; to: string }) {
    const { agent, from, to } = input;
    const stays = `Worktrees and uncommitted work stay on ${from.label}.`;
    if (from.online) {
        return `${agent} will use ${to} for its tools in every chat from its next turn. ${stays}`;
    }
    return `${from.label} is offline. Move now and ${agent} uses ${to} from its next turn, starting from its last synced Drive: edits ${from.label} hasn’t pushed stay there, and Haus won’t merge them. Or wait, and ${agent} moves once ${from.label} is back and has pushed. ${stays}`;
}

export function pendingMachineText(input: {
    from: string;
    to: string;
    waitingFor: AgentMachineWait;
}) {
    switch (input.waitingFor) {
        case 'turn':
            return `Moving to ${input.to} when this turn ends.`;
        case 'drive':
            return `Moving to ${input.to} once ${input.from} pushes its Drive folder.`;
        case 'machine':
            return `Moving to ${input.to} when ${input.from} is back online.`;
    }
}

export function machineRowView(input: {
    agentId: string;
    change: Pick<AgentMachineChange, 'computerId' | 'waitingFor'> | null;
    currentId: string;
    devices: readonly MachineDevice[];
}) {
    const options = machineOptions(input);
    const current = options.find((option) => option.id === input.currentId) ?? {
        id: input.currentId,
        label: 'Device unavailable',
        online: false,
    };
    const { change } = input;
    const pending = change
        ? pendingMachineText({
              from: current.label,
              to:
                  options.find((option) => option.id === change.computerId)?.label ??
                  'another device',
              waitingFor: change.waitingFor,
          })
        : null;
    return { current, options: options.length > 0 ? options : [current], pending };
}
