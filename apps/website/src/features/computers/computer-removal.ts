import { useAgents } from '../../hooks/members/use-agents.ts';

export type ComputerRemovalAvailability =
    | { status: 'checking' }
    | { status: 'error' }
    | { agentNames: string[]; status: 'blocked' }
    | { status: 'ready' };

/**
 * Whether this Computer can be removed right now. Both the shell band's menu and
 * the management card gate on this, so the rule for "all Agents must be deleted
 * first" lives here rather than being re-derived per surface.
 */
export function useComputerRemovalAvailability(
    serverId: string,
    computerId: string
): ComputerRemovalAvailability {
    const agents = useAgents(serverId);

    if (agents.data === undefined) {
        return agents.error ? { status: 'error' } : { status: 'checking' };
    }

    const assignedAgents = agents.data.filter((agent) => agent.computerId === computerId);

    return assignedAgents.length > 0
        ? { agentNames: assignedAgents.map((agent) => agent.displayName), status: 'blocked' }
        : { status: 'ready' };
}

export function computerRemovalDescription(availability: ComputerRemovalAvailability) {
    if (availability.status === 'ready') {
        return 'This immediately revokes this device’s credential.';
    }
    if (availability.status === 'checking') {
        return 'Checking for assigned Captains…';
    }
    if (availability.status === 'error') {
        return 'Assigned Captains could not be verified. Try again.';
    }
    if (availability.agentNames.length === 1) {
        return `Delete ${availability.agentNames[0]} before removing this device.`;
    }
    return `Delete all ${availability.agentNames.length} assigned Captains before removing this device.`;
}
