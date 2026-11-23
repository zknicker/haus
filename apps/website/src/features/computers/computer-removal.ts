import { useAgents } from '../../hooks/members/use-agents.ts';

export interface RemovalCaptain {
    displayName: string;
    id: string;
}

export type ComputerRemovalAvailability =
    | { status: 'checking' }
    | { status: 'error' }
    | { captains: RemovalCaptain[]; status: 'ready' };

/**
 * Whether this Device can be removed right now, and which Captains use it as their Machine.
 * Removal changes each one's Machine (ADR 0057 decision 7), so they no longer block it; the
 * shell band's menu and the removal dialog both read this.
 */
export function useComputerRemovalAvailability(serverId: string, computerId: string) {
    const agents = useAgents(serverId);

    if (agents.data === undefined) {
        const pending: ComputerRemovalAvailability = agents.error
            ? { status: 'error' }
            : { status: 'checking' };
        return pending;
    }

    const ready: ComputerRemovalAvailability = {
        captains: agents.data
            .filter((agent) => agent.computerId === computerId)
            .map(({ displayName, id }) => ({ displayName, id })),
        status: 'ready',
    };
    return ready;
}

export function computerRemovalDescription(availability: ComputerRemovalAvailability) {
    if (availability.status === 'ready') {
        return 'This immediately revokes this device’s credential.';
    }
    if (availability.status === 'checking') {
        return 'Checking which Captains use this device…';
    }
    return 'The Captains using this device could not be loaded. Try again.';
}
