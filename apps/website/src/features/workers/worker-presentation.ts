import {
    type WorkerBranch,
    type WorkerJobState,
    type WorkerTurn,
    type WorkerTurnStatus,
    type Worker,
    workerPullRequestNumber,
    isTerminalWorkerTurnStatus,
} from '@haus/api';

export type WorkerTone = 'accent' | 'danger' | 'muted' | 'success' | 'warning';

/** A live work that has not reported for this long reads as gone quiet. */
export const workerStaleAfterMs = 10 * 60_000;

export type WorkerPresentationInput = Pick<
    Worker,
    'activity' | 'cancelRequestedAt' | 'job' | 'turns' | 'status' | 'updatedAt'
>;

export const workerJobLabels: Record<WorkerJobState, string> = {
    cancelled: 'Stopped',
    done: 'Done',
    expired: 'Expired',
    failed: 'Failed',
    'pending-input': 'Needs input',
    working: 'Working',
};

export const workerTurnStatusLabels: Record<WorkerTurnStatus, string> = {
    cancelled: 'Stopped',
    completed: 'Completed',
    expired: 'Expired',
    failed: 'Failed',
    pending_input: 'Waiting on you',
    queued: 'Queued',
    running: 'Running',
};

export function newestWorkerTurn(work: { turns: readonly WorkerTurn[] }): WorkerTurn | null {
    return work.turns[0] ?? null;
}

/** A cancelled or expired job ended without failing, so it no longer asks for attention. */
export function isEndedWorkerJob(state: WorkerJobState): boolean {
    return state === 'cancelled' || state === 'expired';
}

/**
 * The one point of lifecycle color on the surface. A cancelled or expired job
 * is muted rather than dangerous: somebody asked for it, or it ran out of time.
 * A job waiting on an answer is a warning: it is stopped until someone replies.
 */
export function workerJobTone(state: WorkerJobState): WorkerTone {
    switch (state) {
        case 'working':
            return 'accent';
        case 'done':
            return 'success';
        case 'failed':
            return 'danger';
        case 'pending-input':
            return 'warning';
        case 'cancelled':
        case 'expired':
            return 'muted';
    }
}

/** The Chip color the card's headline wears, from the one tone rule above. */
export function workerJobChipColor(
    state: WorkerJobState
): 'accent' | 'danger' | 'default' | 'success' | 'warning' {
    switch (state) {
        case 'working':
            return 'accent';
        case 'done':
            return 'success';
        case 'failed':
            return 'danger';
        case 'pending-input':
            return 'warning';
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
export function workerJobText(job: Worker['job'], now: number): string {
    const label = workerJobLabels[job.state];
    if (job.state === 'working') {
        const elapsed = elapsedSince(job.startedAt, now);
        return elapsed === null ? label : `${label} · ${elapsed}`;
    }
    if (job.state === 'done') {
        const took = spanMs(job.startedAt, job.settledAt);
        return took === null || took < 1000 ? label : `${label} · ${formatWorkerDuration(took)}`;
    }
    return label;
}

/** Launching and stopping are concrete lifecycle stages, never generic working labels. */
export function workerText(
    work: Pick<Worker, 'job' | 'status' | 'createdAt' | 'cancelRequestedAt'>,
    now: number
): string {
    if (!isTerminalWorkerTurnStatus(work.status) && work.cancelRequestedAt) {
        return 'Stopping';
    }
    if (
        work.job.state === 'failed' &&
        (work.job.errorCode?.startsWith('launch-') ||
            work.job.errorCode?.startsWith('provider-launch-'))
    ) {
        return 'Stopped';
    }
    if (work.job.state === 'working' && work.status === 'queued' && !work.job.followUp) {
        const elapsed = elapsedSince(work.createdAt, now);
        return elapsed === null ? 'Starting' : `Starting · ${elapsed}`;
    }
    return workerJobText(work.job, now);
}

/**
 * How long a live work has been quiet, once that passes the stale threshold:
 * its newest Run is queued or running and none of its Runs has reported for a
 * while. This reads from the work's own `updatedAt`, which any Run's
 * observation advances, rather than from Computer connection state: the
 * reader cares that nothing has been reported, not why.
 */
export function quietFor(
    work: Pick<WorkerPresentationInput, 'status' | 'updatedAt'>,
    now: number
): null | number {
    if (isTerminalWorkerTurnStatus(work.status)) {
        return null;
    }
    const updatedAt = Date.parse(work.updatedAt);
    if (!Number.isFinite(updatedAt) || now - updatedAt <= workerStaleAfterMs) {
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
export function workerBranch(work: Pick<WorkerPresentationInput, 'turns'>): WorkerBranch | null {
    const branches = work.turns.flatMap((run) => run.branches);
    return branches.find((branch) => branch.pullRequestUrl !== null) ?? branches.at(0) ?? null;
}

/**
 * The pull request number one branch names. The Computer's own GitHub reading
 * is authoritative when it exists; otherwise the provider's URL is parsed, so
 * a branch observed before any snapshot still says `PR #482` rather than print
 * a URL. An unrecognised URL keeps its link and loses only the number.
 */
export function workerBranchPullRequestNumber(branch: WorkerBranch): null | number {
    if (branch.pullRequest) {
        return branch.pullRequest.number;
    }
    return branch.pullRequestUrl === null ? null : workerPullRequestNumber(branch.pullRequestUrl);
}

/** A delegating Agent the viewer's Agent list no longer has, named by the tail of its id. */
export function workerAgentFallbackName(agentId: string): string {
    return `Captain ${agentId.slice(-6)}`;
}

/** Owners and Admins may cancel; a settled Run has nothing left to stop. */
export function canCancelWorker(input: {
    cancelRequestedAt: string | null;
    role: string;
    status: WorkerTurnStatus;
}): boolean {
    return (
        (input.role === 'owner' || input.role === 'admin') &&
        !isTerminalWorkerTurnStatus(input.status) &&
        input.cancelRequestedAt === null
    );
}

/** Coarse by design: a work surface states minutes, not a stopwatch. */
export function formatWorkerDuration(durationMs: number): string {
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
    return formatWorkerDuration(Math.max(0, now - started));
}

function spanMs(startedAt: null | string, terminalAt: null | string) {
    const started = startedAt === null ? Number.NaN : Date.parse(startedAt);
    const ended = terminalAt === null ? Number.NaN : Date.parse(terminalAt);
    if (!(Number.isFinite(started) && Number.isFinite(ended))) {
        return null;
    }
    return Math.max(0, ended - started);
}
