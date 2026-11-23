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

export const captainAccessScopes = [
    { id: 'selected', label: 'Selected Captains' },
    { id: 'all', label: 'All Captains on this Server' },
] as const satisfies ReadonlyArray<{ id: ComputerAgentAccessScope; label: string }>;

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
        return 'Any Captain on this Server can run tools here.';
    }
    const names = [...view.machine, ...view.granted].map((captain) => captain.displayName);
    if (names.length === 0) {
        return 'No Captains can run tools here yet.';
    }
    const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names;
    return `Only ${listNames(shown)} can run tools here.`;
}

export function computerUseSentence(enabled: boolean) {
    return enabled
        ? 'Those Captains can see the screen and click and type in apps.'
        : 'Captains can’t see or control this Mac’s screen.';
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

function listNames(names: readonly string[]) {
    return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}
