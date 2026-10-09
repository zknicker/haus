import type { CloudAgentJobState, CloudAgentWork } from '@haus/api';
import {
    cloudAgentBranchPullRequestNumber,
    cloudAgentJobLabels,
    cloudAgentWorkBranch,
    elapsedSince,
    formatCloudAgentDuration,
    quietFor,
} from './cloud-agent-presentation.ts';

/**
 * One job as the Thread preview lists it: always its title, its job state in
 * the card's vocabulary, and the pull request number once there is one. A
 * live job that has gone quiet reads as `No update in <d>` instead of its
 * state, because that is the fact a reader has to act on.
 */
export interface ThreadCloudAgentRow {
    pullRequestNumber: null | number;
    state: CloudAgentJobState;
    statusText: string;
    tone: 'default' | 'warning';
    work: CloudAgentWork;
}

/**
 * One row per job in the order the jobs were started (oldest first), so rows
 * never move while their jobs change state. Ties keep the Server's order.
 */
export function threadCloudAgentRows(
    works: readonly CloudAgentWork[],
    now: number
): ThreadCloudAgentRow[] {
    return works
        .map((work, index) => ({ createdAt: Date.parse(work.createdAt), index, work }))
        .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index)
        .map(({ work }) => toRow(work, now));
}

function toRow(work: CloudAgentWork, now: number): ThreadCloudAgentRow {
    const branch = cloudAgentWorkBranch(work);
    const pullRequestNumber = branch ? cloudAgentBranchPullRequestNumber(branch) : null;
    const quiet = work.job.state === 'failed' ? null : quietFor(work, now);
    if (quiet !== null) {
        return {
            pullRequestNumber,
            state: work.job.state,
            statusText: `No update in ${formatCloudAgentDuration(quiet)}`,
            tone: 'warning',
            work,
        };
    }
    const label = cloudAgentJobLabels[work.job.state];
    const elapsed = work.job.state === 'working' ? elapsedSince(work.job.startedAt, now) : null;
    return {
        pullRequestNumber,
        state: work.job.state,
        statusText: elapsed === null ? label : `${label} · ${elapsed}`,
        tone: 'default',
        work,
    };
}
