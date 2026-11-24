import type { ComputerAgentAccessGrant, ComputerAgentAccessScope } from '@haus/api';

export interface AccessCaptain {
    avatarUrl: string | null;
    displayName: string;
    id: string;
}

export interface AgentAccessView {
    granted: readonly AccessCaptain[];
    machine: readonly AccessCaptain[];
    others: readonly AccessCaptain[];
}

export function agentAccessView({
    agents,
    computerId,
    grants,
}: {
    agents: readonly (AccessCaptain & { computerId: string | null })[];
    computerId: string;
    grants: readonly Pick<ComputerAgentAccessGrant, 'agentId'>[];
}) {
    const granted = new Set(grants.map((grant) => grant.agentId));
    const sorted = [...agents].sort((a, b) => a.displayName.localeCompare(b.displayName));
    const view: AgentAccessView = {
        granted: sorted.filter((agent) => agent.computerId !== computerId && granted.has(agent.id)),
        machine: sorted.filter((agent) => agent.computerId === computerId),
        others: sorted.filter((agent) => agent.computerId !== computerId && !granted.has(agent.id)),
    };
    return view;
}

export function captainAccessSentence(scope: ComputerAgentAccessScope, view: AgentAccessView) {
    if (scope === 'all') {
        return 'Any Captain can run tools here.';
    }
    const names = allowedCaptains(view).map((captain) => captain.displayName);
    if (names.length === 0) {
        return 'No Captains can run tools here.';
    }
    const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names;
    return `${listNames(shown)} can run tools here.`;
}

export function captainAccessLabel(scope: ComputerAgentAccessScope, view: AgentAccessView) {
    if (scope === 'all') {
        return 'All Captains';
    }
    const count = allowedCaptains(view).length;
    if (count === 0) {
        return 'No Captains';
    }
    return count === 1 ? '1 Captain' : `${count} Captains`;
}

export function captainScopeRights(
    scope: ComputerAgentAccessScope,
    rights: { canGrant: boolean; canRevoke: boolean }
) {
    const steward = rights.canGrant || rights.canRevoke;
    return { canChange: steward && (scope === 'all' || rights.canGrant), steward };
}

export function computerUseSentence(enabled: boolean) {
    return enabled
        ? 'Allowed Captains can see and control the screen.'
        : 'Captains can’t see or control the screen.';
}

export function captainChooserKeys(
    view: AgentAccessView,
    rights: { canGrant: boolean; canRevoke: boolean }
) {
    const selected = [...view.machine, ...view.granted].map((captain) => captain.id);
    const disabled = [
        ...view.machine.map((captain) => captain.id),
        ...(rights.canRevoke ? [] : view.granted.map((captain) => captain.id)),
        ...(rights.canGrant ? [] : view.others.map((captain) => captain.id)),
    ];
    return { disabled, selected };
}

export function captainChooserChange(view: AgentAccessView, next: ReadonlySet<string>) {
    const added = view.others.find((captain) => next.has(captain.id));
    if (added) {
        return { agentId: added.id, kind: 'grant' } as const;
    }
    const removed = view.granted.find((captain) => !next.has(captain.id));
    return removed ? ({ agentId: removed.id, kind: 'revoke' } as const) : null;
}

function allowedCaptains(view: AgentAccessView) {
    return [...view.machine, ...view.granted];
}

function listNames(names: readonly string[]) {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}
