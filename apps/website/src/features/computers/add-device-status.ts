import type { ComputerInventory } from '@haus/api';

export interface AddedDevice {
    attachedByCurrentUser: boolean;
    createdAt: string | Date;
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    id: string;
    inventoryInvalidAt: string | Date | null;
    lastConnectedAt: string | Date | null;
    reportedInventory: ComputerInventory | null;
}

export type AddDeviceStatus =
    | { kind: 'waiting' }
    | { kind: 'ready'; runtimeCount: number }
    | { kind: 'detecting' }
    | { kind: 'repair'; command: string | null; message: string; title: string };

export function addDeviceStatus(
    baselineIds: ReadonlySet<string> | null,
    devices: readonly AddedDevice[],
    serverSlug: string
) {
    if (!baselineIds) {
        return { kind: 'waiting' } satisfies AddDeviceStatus;
    }
    const device = devices
        .filter((entry) => entry.attachedByCurrentUser && !baselineIds.has(entry.id))
        .sort((left, right) => time(right.createdAt) - time(left.createdAt))[0];
    if (!device) {
        return { kind: 'waiting' } satisfies AddDeviceStatus;
    }
    if (device.health === 'update-required') {
        return {
            command: 'haus-computer upgrade',
            kind: 'repair',
            message: 'This device runs an older Haus Computer. Update it, and it reconnects.',
            title: 'Update needed',
        } satisfies AddDeviceStatus;
    }
    if (device.inventoryInvalidAt) {
        return {
            command: 'haus-computer upgrade',
            kind: 'repair',
            message: 'This device sent a report Haus could not read. Update Haus Computer on it.',
            title: 'Update needed',
        } satisfies AddDeviceStatus;
    }
    if (device.health === 'offline' && !device.lastConnectedAt) {
        return { kind: 'waiting' } satisfies AddDeviceStatus;
    }
    if (device.health === 'offline') {
        return {
            command: `haus-computer setup /${serverSlug}`,
            kind: 'repair',
            message: 'This device disconnected. Run setup on it again.',
            title: 'Device disconnected',
        } satisfies AddDeviceStatus;
    }
    if (!device.reportedInventory) {
        return { kind: 'detecting' } satisfies AddDeviceStatus;
    }
    const runtimeCount = device.reportedInventory.runtimes.filter(
        (runtime) => runtime.models.length > 0
    ).length;
    if (runtimeCount === 0) {
        return {
            command: null,
            kind: 'repair',
            message:
                'Sign in to Claude Code or Codex on this device. Captains run on those, and it shows up here once one is signed in.',
            title: 'No Captain runtime yet',
        } satisfies AddDeviceStatus;
    }
    return { kind: 'ready', runtimeCount } satisfies AddDeviceStatus;
}

function time(value: string | Date) {
    return new Date(value).getTime();
}
