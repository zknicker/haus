import {
    type ComputerUseAgents,
    type ComputerUsePermissionState,
    type ComputerUseReadiness,
    computerUsePanes,
} from '@haus/api';

export const computerUseDescription =
    'Captains can see the screen and click and type in applications on this Device.';

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

export const allCaptainsKey = 'all';

export function nextComputerUseAgents(current: ComputerUseAgents, keys: readonly string[]) {
    const picksAll = keys.includes(allCaptainsKey);
    if (picksAll && current.kind === 'named') {
        return { kind: 'all' } as const;
    }
    const agentIds = keys.filter((key) => key !== allCaptainsKey);
    const [first, ...rest] = agentIds;
    if (first === undefined) {
        return null;
    }
    return { agentIds: [first, ...rest] as [string, ...string[]], kind: 'named' } as const;
}

export function computerUseAgentKeys(agents: ComputerUseAgents) {
    return agents.kind === 'all' ? [allCaptainsKey] : agents.agentIds;
}

/** Who computer use can name: this Device's Captains, then Captains its Agent access allows. */
export function computerUseCaptains<
    Agent extends { computerId: string | null; displayName: string; id: string },
>(agents: readonly Agent[], computerId: string, grantedAgentIds: readonly string[]) {
    return agents
        .filter((agent) => agent.computerId === computerId || grantedAgentIds.includes(agent.id))
        .map((agent) => ({
            displayName: agent.displayName,
            home: agent.computerId === computerId,
            id: agent.id,
        }))
        .sort((a, b) => Number(b.home) - Number(a.home));
}

export function computerUseAgentsSummary(
    agents: ComputerUseAgents,
    captains: readonly { displayName: string; home: boolean; id: string }[]
) {
    if (agents.kind === 'all') {
        const home = captains.filter((captain) => captain.home);
        return home.length > 0
            ? `All Captains on this Device, including ones added later (now ${listNames(home.map((captain) => captain.displayName))}).`
            : 'All Captains on this Device, including ones added later.';
    }
    const names = agents.agentIds
        .map((id) => captains.find((captain) => captain.id === id)?.displayName)
        .filter((name) => name !== undefined);
    return names.length > 0 ? `Only ${listNames(names)}.` : 'No Captains. Pick at least one.';
}

function listNames(names: readonly string[]) {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}
