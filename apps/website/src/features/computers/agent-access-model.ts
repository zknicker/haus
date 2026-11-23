import type { ComputerAgentAccessGrant } from '@haus/api';

export const agentAccessDescription =
    'An allowed Captain runs commands on this device as its user, and anyone who can message the Captain can ask it to.';

export interface AccessCaptain {
    avatarUrl: string | null;
    displayName: string;
    id: string;
}

export interface AgentAccessView {
    candidates: readonly AccessCaptain[];
    granted: readonly (AccessCaptain & { grantedBy: string })[];
    home: readonly AccessCaptain[];
}

export function agentAccessView({
    agents,
    computerId,
    grants,
    personName,
}: {
    agents: readonly (AccessCaptain & { computerId: string | null })[];
    computerId: string;
    grants: readonly Pick<ComputerAgentAccessGrant, 'agentId' | 'grantedByUserId'>[];
    personName: (userId: string) => string;
}) {
    const home = agents.filter((agent) => agent.computerId === computerId).map(captainOf);
    const granted = grants.flatMap((grant) => {
        const agent = agents.find((candidate) => candidate.id === grant.agentId);
        if (!agent || agent.computerId === computerId) {
            return [];
        }
        return [{ ...captainOf(agent), grantedBy: personName(grant.grantedByUserId) }];
    });
    const taken = new Set([...home, ...granted].map((captain) => captain.id));
    const candidates = agents
        .filter((agent) => !taken.has(agent.id))
        .map(captainOf)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { candidates, granted, home } satisfies AgentAccessView;
}

export function homeCaptainsSummary(home: readonly AccessCaptain[]) {
    return home.length > 0
        ? `Always allowed: ${listNames(home.map((captain) => captain.displayName))}.`
        : 'None yet.';
}

function listNames(names: readonly string[]) {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}

function captainOf(agent: AccessCaptain) {
    return {
        avatarUrl: agent.avatarUrl,
        displayName: agent.displayName,
        id: agent.id,
    } satisfies AccessCaptain;
}
