import type { ComputerInventory } from '@haus/api';

const upgradeCommand = '$HOME/.local/bin/haus-computer upgrade';

export interface AddedDevice {
    attachedByCurrentUser: boolean;
    createdAt: string | Date;
    health: 'degraded' | 'healthy' | 'offline' | 'update-required';
    id: string;
    inventoryInvalidAt: string | Date | null;
    lastConnectedAt: string | Date | null;
    reportedInventory: ComputerInventory | null;
}

export interface AddDeviceStatus {
    command: string | null;
    label: string;
    recheckComputerId: string | null;
    tone: 'pending' | 'success' | 'warning';
}

export function addDeviceStatus(
    baselineIds: ReadonlySet<string> | null,
    devices: readonly AddedDevice[]
) {
    const device = baselineIds
        ? devices
              .filter((entry) => entry.attachedByCurrentUser && !baselineIds.has(entry.id))
              .sort((left, right) => time(right.createdAt) - time(left.createdAt))[0]
        : undefined;
    if (!device || (device.health === 'offline' && !device.lastConnectedAt)) {
        return status('pending', 'Waiting for the device…');
    }
    if (device.health === 'update-required' || device.inventoryInvalidAt) {
        return { ...status('warning', 'Update needed'), command: upgradeCommand };
    }
    if (device.health === 'offline') {
        return status('warning', 'Disconnected. Run Setup again.');
    }
    if (!device.reportedInventory) {
        return status('pending', 'Connecting…');
    }
    if (!device.reportedInventory.runtimes.some((runtime) => runtime.models.length > 0)) {
        return {
            ...status('warning', 'Sign in to Claude Code or Codex on this Mac'),
            recheckComputerId: device.id,
        };
    }
    return status('success', 'Connected');
}

function status(tone: AddDeviceStatus['tone'], label: string) {
    return { command: null, label, recheckComputerId: null, tone } satisfies AddDeviceStatus;
}

function time(value: string | Date) {
    return new Date(value).getTime();
}
