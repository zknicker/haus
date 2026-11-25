import type { ComputerUseReadiness } from '@haus/api';
import { ComputerIcon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import { formatRelativeTime } from '../../lib/format.ts';
import { computerUseBroken } from './computer-use-model.ts';
import { computerHealthColor, computerHealthLabel } from './presentation.ts';

interface ListedDevice {
    attachedByCurrentUser: boolean;
    computerUseEnabled: boolean;
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    lastConnectedAt: Date | string | null;
    name: string | null;
    reportedInventory: { computerUse?: ComputerUseReadiness } | null;
}

export function deviceGroups<Device extends ListedDevice>(devices: readonly Device[]) {
    return {
        others: devices.filter((device) => !device.attachedByCurrentUser),
        yours: devices.filter((device) => device.attachedByCurrentUser),
    };
}

export function deviceIssue(
    device: Pick<ListedDevice, 'computerUseEnabled' | 'health' | 'reportedInventory'>
) {
    const health =
        device.health === 'healthy' && computerUseBroken(device) ? 'degraded' : device.health;
    if (health === 'healthy') {
        return null;
    }
    return {
        color: computerHealthColor(health),
        label: computerHealthLabel(health),
    };
}

export function deviceLastSeen(device: ListedDevice, now = Date.now()) {
    if (device.health !== 'offline') {
        return null;
    }
    if (!device.lastConnectedAt) {
        return 'Never connected';
    }
    return `Last seen ${formatRelativeTime(new Date(device.lastConnectedAt).toISOString(), now)}`;
}

export function deviceMark(device: Pick<ListedDevice, 'name'>) {
    return /macbook|laptop/iu.test(device.name ?? '') ? LaptopIcon : ComputerIcon;
}
