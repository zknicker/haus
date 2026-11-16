import type { Agent } from '@haus/api';

/** Claims are Agent work (ADR 0037): the assignee is an Agent or nobody. */
export function claimAssigneeName(claim: { assigneeAgentId: null | string }, agents: Agent[]) {
    if (claim.assigneeAgentId) {
        const agent = agents.find((candidate) => candidate.id === claim.assigneeAgentId);
        return agent?.displayName ?? `Agent ${claim.assigneeAgentId.slice(-6)}`;
    }
    return 'Unassigned';
}

export function claimAssigneeAvatarUrl(claim: { assigneeAgentId: null | string }, agents: Agent[]) {
    if (!claim.assigneeAgentId) {
        return null;
    }
    return agents.find((candidate) => candidate.id === claim.assigneeAgentId)?.avatarUrl ?? null;
}
