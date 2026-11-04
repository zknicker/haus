import type { HausInputs } from '../../../lib/haus-server.tsx';

interface VersionedClaim {
    id: string;
    version: number;
}

export function claimAssignmentInput(
    serverId: string,
    claim: VersionedClaim,
    assignee: HausInputs['claim']['assign']['assignee']
): HausInputs['claim']['assign'] {
    return {
        assignee,
        expectedVersion: claim.version,
        messageId: claim.id,
        serverId,
    };
}

export function claimUpdateInput(
    serverId: string,
    claim: VersionedClaim,
    patch: HausInputs['claim']['update']['patch']
): HausInputs['claim']['update'] {
    return {
        expectedVersion: claim.version,
        messageId: claim.id,
        patch,
        serverId,
    };
}

export function toggledTaskLabelIds(currentIds: string[], labelId: string, selected: boolean) {
    if (selected) {
        return currentIds.includes(labelId) ? currentIds : [...currentIds, labelId];
    }
    return currentIds.filter((id) => id !== labelId);
}
