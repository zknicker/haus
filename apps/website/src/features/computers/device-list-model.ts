import { ComputerIcon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import { formatRelativeTime } from '../../lib/format.ts';
import { computerHealthColor, computerHealthLabel } from './presentation.ts';

interface ListedDevice {
    attachedByCurrentUser: boolean;
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    lastConnectedAt: Date | string | null;
    name: string | null;
}

export function deviceGroups<Device extends ListedDevice>(devices: readonly Device[]) {
    return {
        others: devices.filter((device) => !device.attachedByCurrentUser),
        yours: devices.filter((device) => device.attachedByCurrentUser),
    };
}

export function deviceIssue(device: Pick<ListedDevice, 'health'>) {
    if (device.health === 'healthy') {
        return null;
    }
    return {
        color: computerHealthColor(device.health),
        label: computerHealthLabel(device.health),
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
