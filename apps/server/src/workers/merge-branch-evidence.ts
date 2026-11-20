import type { WorkerBranch } from '@haus/api';

/**
 * Merges a Run's newly reported branch evidence over what it already carried.
 *
 * The branch report itself is replaced wholesale — it is the provider's own
 * current answer about which branches a Run wrote. The pull-request snapshot on
 * a branch is different: the Computer reads it from GitHub and may fail to,
 * which is reported as no snapshot at all. Losing a recorded snapshot because
 * one read timed out would make a card forget facts it had already shown, so an
 * absent snapshot keeps the recorded one, and a reported snapshot replaces a
 * recorded one only when its own `observedAt` is at least as new.
 */
export function mergeBranchEvidence(
    recorded: WorkerBranch[],
    reported: WorkerBranch[]
): WorkerBranch[] {
    const byBranch = new Map(recorded.map((branch) => [keyOf(branch), branch]));
    return reported.map((branch) => {
        const pullRequest = newerOf(
            byBranch.get(keyOf(branch))?.pullRequest ?? null,
            branch.pullRequest ?? null
        );
        return pullRequest ? { ...branch, pullRequest } : branch;
    });
}

function newerOf(
    recorded: WorkerBranch['pullRequest'],
    reported: WorkerBranch['pullRequest']
): WorkerBranch['pullRequest'] {
    if (!(recorded && reported)) {
        return reported ?? recorded ?? null;
    }
    return reported.observedAt >= recorded.observedAt ? reported : recorded;
}

function keyOf(branch: WorkerBranch): string {
    return `${branch.repository} ${branch.branch}`;
}
