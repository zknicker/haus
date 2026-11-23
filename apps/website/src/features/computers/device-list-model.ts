import { ComputerIcon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import { formatRelativeTime } from '../../lib/format.ts';
import { computerHealthLabel } from './presentation.ts';

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

export function deviceStatusLine(device: ListedDevice, now = Date.now()) {
    if (device.health !== 'offline') {
        return computerHealthLabel(device.health);
    }
    if (!device.lastConnectedAt) {
        return 'Offline · never connected';
    }
    return `Offline · last seen ${formatRelativeTime(new Date(device.lastConnectedAt).toISOString(), now)}`;
}

export function deviceMark(device: Pick<ListedDevice, 'name'>) {
    return /macbook|laptop/iu.test(device.name ?? '') ? LaptopIcon : ComputerIcon;
}
