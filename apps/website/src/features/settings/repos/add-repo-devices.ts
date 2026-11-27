import type { HausOutputs } from '../../../lib/haus-server.tsx';
import { computerLabel } from '../../computers/presentation.ts';

type Computer = HausOutputs['computer']['list'][number];
type Agent = Pick<HausOutputs['agent']['list'][number], 'computerId'>;

export interface AddableDevice {
    id: string;
    isOnline: boolean;
    name: string;
}

export function addableDevices(computers: readonly Computer[]) {
    return computers
        .filter((computer) => computer.attachedByCurrentUser)
        .map(
            (computer) =>
                ({
                    id: computer.id,
                    isOnline:
                        computer.health !== 'offline' && computer.health !== 'update-required',
                    name: computerLabel(computer),
                }) satisfies AddableDevice
        );
}

export function defaultDeviceId(devices: readonly AddableDevice[], localComputerId: string | null) {
    const local = devices.find((device) => device.id === localComputerId);
    return (local ?? devices.find((device) => device.isOnline) ?? devices[0])?.id ?? null;
}

export function deviceReachNotice(computer: Computer, agents: readonly Agent[]) {
    const captains =
        agents.filter((agent) => agent.computerId === computer.id).length +
        computer.agentAccessGrants.length;
    const name = computerLabel(computer);
    return captains === 0 ? `No Captains can reach ${name} yet.` : null;
}
