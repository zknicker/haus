import {
    type ComputerUsePermissionState,
    type ComputerUseReadiness,
    computerUsePanes,
} from '@haus/api';

export const defaultComputerAppPath = '~/.local/share/haus-computer/Haus Computer.app';

export function supportsComputerUse(computer: { operatingSystem: string | null }) {
    return computer.operatingSystem?.toLowerCase() === 'darwin';
}

export interface ComputerUsePermission {
    id: 'accessibility' | 'screen-recording';
    pane: string;
    purpose: string;
    settingsUrl: string;
    state: ComputerUsePermissionState;
    steps: string;
}

const privacyPane = 'x-apple.systempreferences:com.apple.preference.security';

export function computerUsePermissions(readiness: ComputerUseReadiness | undefined) {
    if (!readiness?.installed) {
        return [];
    }
    const panes = computerUsePanes(readiness.macosVersion);
    const overrideFlow = panes.accessibility === 'System & App Protection Override';
    const permissions: ComputerUsePermission[] = [
        {
            id: 'accessibility',
            pane: panes.accessibility,
            purpose: 'Lets Captains read and click the apps on screen.',
            settingsUrl: `${privacyPane}?Privacy_Accessibility`,
            state: readiness.accessibility,
            steps: overrideFlow
                ? 'Click +, choose Override System Protections, then Choose Apps. Pick Haus Computer and choose Control Your Entire Mac and All Apps.'
                : 'Click +, pick Haus Computer, and turn it on.',
        },
        {
            id: 'screen-recording',
            pane: panes.screenRecording,
            purpose: 'Lets Captains take screenshots.',
            settingsUrl: `${privacyPane}?Privacy_ScreenCapture`,
            state: readiness.screenRecording,
            steps: 'Turn on Haus Computer. If it isn’t listed, click + and pick it.',
        },
    ];
    return permissions;
}

export function computerUseNeedsGrant(readiness: ComputerUseReadiness | undefined) {
    return computerUsePermissions(readiness).some((permission) => permission.state !== 'granted');
}

export function missingComputerUsePermission(readiness: ComputerUseReadiness | undefined) {
    return computerUsePermissions(readiness).find((permission) => permission.state === 'denied');
}

export function computerUseBroken(device: {
    computerUseEnabled: boolean;
    reportedInventory: { computerUse?: ComputerUseReadiness } | null;
}) {
    return (
        device.computerUseEnabled &&
        missingComputerUsePermission(device.reportedInventory?.computerUse) !== undefined
    );
}

export function wrongMacLine(input: {
    deviceName: string;
    devices: ReadonlyArray<{ id: string; name: string }>;
    localComputerId: string | null | undefined;
    targetId: string;
}) {
    const local = input.devices.find((device) => device.id === input.localComputerId);
    if (!local || local.id === input.targetId) {
        return null;
    }
    return `You’re on ${local.name}. Do this on ${input.deviceName}, through Screen Sharing if it has no display.`;
}

export function permissionStateLabel(state: ComputerUsePermissionState) {
    switch (state) {
        case 'granted':
            return 'Granted';
        case 'denied':
            return 'Not granted';
        case 'unknown':
            return 'Couldn’t check';
    }
}
