import {
    type CloudAgentBranch,
    type CloudAgentJobState,
    type CloudAgentStatus,
    type CloudAgentWork,
    cloudAgentPullRequestNumber,
    isTerminalCloudAgentStatus,
} from '@haus/api';

export type CloudAgentTone = 'accent' | 'danger' | 'muted' | 'success' | 'warning';

/** A live work that has not reported for this long reads as gone quiet. */
export const cloudAgentStaleAfterMs = 10 * 60_000;

export type CloudAgentWorkPresentationInput = Pick<
    CloudAgentWork,
    'activity' | 'cancelRequestedAt' | 'job' | 'runs' | 'status' | 'updatedAt'
>;

export const cloudAgentJobLabels: Record<CloudAgentJobState, string> = {
    cancelled: 'Cancelled',
    done: 'Done',
    expired: 'Expired',
    failed: 'Failed',
    working: 'Working',
};

/** A cancelled or expired job ended without failing, so it no longer asks for attention. */
export function isEndedCloudAgentJob(state: CloudAgentJobState): boolean {
    return state === 'cancelled' || state === 'expired';
}

/**
 * The one point of lifecycle color on the surface. A cancelled or expired job
 * is muted rather than dangerous: somebody asked for it, or it ran out of time.
 */
export function cloudAgentJobTone(state: CloudAgentJobState): CloudAgentTone {
    switch (state) {
        case 'working':
            return 'accent';
        case 'done':
            return 'success';
        case 'failed':
            return 'danger';
        case 'cancelled':
        case 'expired':
            return 'muted';
    }
}

/** The Chip color the card's headline wears, from the one tone rule above. */
export function cloudAgentJobChipColor(
    state: CloudAgentJobState
): 'accent' | 'danger' | 'default' | 'success' {
    switch (state) {
        case 'working':
            return 'accent';
        case 'done':
            return 'success';
        case 'failed':
            return 'danger';
        case 'cancelled':
        case 'expired':
            return 'default';
    }
}

/**
 * The headline one job reads as: the job's state, never its newest Run's. A
 * working job states how long it has been going; a done one how long it took,
 * because that is the fact a reader scanning back needs.
 */
export function cloudAgentJobText(job: CloudAgentWork['job'], now: number): string {
    const label = cloudAgentJobLabels[job.state];
    if (job.state === 'working') {
        const elapsed = elapsedSince(job.startedAt, now);
        return elapsed === null ? label : `${label} · ${elapsed}`;
    }
    if (job.state === 'done') {
        const duration = spanBetween(job.startedAt, job.settledAt);
        return duration === null ? label : `${label} · ${duration}`;
    }
    return label;
}

/**
 * How long a live work has been quiet, once that passes the stale threshold:
 * its newest Run is queued or running and none of its Runs has reported for a
 * while. This reads from the work's own `updatedAt`, which any Run's
 * observation advances, rather than from Computer connection state: the
 * reader cares that nothing has been reported, not why.
 */
export function quietFor(
    work: Pick<CloudAgentWorkPresentationInput, 'status' | 'updatedAt'>,
    now: number
): null | number {
    if (isTerminalCloudAgentStatus(work.status)) {
        return null;
    }
    const updatedAt = Date.parse(work.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt <= cloudAgentStaleAfterMs) {
        return null;
    }
    return now - updatedAt;
}

/**
 * The branch evidence the job has produced. A follow-up Run reports nothing
 * until it settles, so the newest Run that reported a pull request wins, then
 * the newest Run that reported any branch: the pull request never disappears
 * because a follow-up was sent.
 */
export function cloudAgentWorkBranch(
    work: Pick<CloudAgentWorkPresentationInput, 'runs'>
): CloudAgentBranch | null {
    const branches = work.runs.flatMap((run) => run.branches);
    return branches.find((branch) => branch.pullRequestUrl !== null) ?? branches.at(0) ?? null;
}

/**
 * The pull request number one branch names. The Computer's own GitHub reading
 * is authoritative when it exists; otherwise the provider's URL is parsed, so
 * a branch observed before any snapshot still says `PR #482` rather than print
 * a URL. An unrecognised URL keeps its link and loses only the number.
 */
export function cloudAgentBranchPullRequestNumber(branch: CloudAgentBranch): null | number {
    if (branch.pullRequest) {
        return branch.pullRequest.number;
    }
    return branch.pullRequestUrl === null
        ? null
        : cloudAgentPullRequestNumber(branch.pullRequestUrl);
}

/** Owners and Admins may cancel; a settled Run has nothing left to stop. */
export function canCancelCloudAgentWork(input: {
    cancelRequestedAt: string | null;
    role: string;
    status: CloudAgentStatus;
}): boolean {
    return (
        (input.role === 'owner' || input.role === 'admin') &&
        !isTerminalCloudAgentStatus(input.status) &&
        input.cancelRequestedAt === null
    );
}

/** Coarse by design: a work surface states minutes, not a stopwatch. */
export function formatCloudAgentDuration(durationMs: number): string {
    const seconds = Math.max(0, Math.floor(durationMs / 1000));

    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function elapsedSince(startedAt: null | string, now: number): null | string {
    const started = startedAt === null ? Number.NaN : Date.parse(startedAt);
    if (!Number.isFinite(started)) {
        return null;
    }
    return formatCloudAgentDuration(Math.max(0, now - started));
}

export function spanBetween(startedAt: null | string, terminalAt: null | string): null | string {
    const started = startedAt === null ? Number.NaN : Date.parse(startedAt);
    const ended = terminalAt === null ? Number.NaN : Date.parse(terminalAt);
    if (!(Number.isFinite(started) && Number.isFinite(ended))) {
        return null;
    }
    return formatCloudAgentDuration(Math.max(0, ended - started));
}
