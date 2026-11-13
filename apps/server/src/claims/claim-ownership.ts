import type { MessageClaim } from '@haus/api';

type ClaimOwnership = Pick<MessageClaim, 'assigneeAgentId'>;

export function claimHasOtherOwnerForAgent(claim: ClaimOwnership, agentId: string) {
    return Boolean(claim.assigneeAgentId && claim.assigneeAgentId !== agentId);
}
