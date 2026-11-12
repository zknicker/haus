import type { CloudAgentJob } from './cloud-agent-job.ts';
import type { CloudAgentPullRequestReading, CloudAgentWork } from './cloud-agent-shared.ts';
import {
    type OpenThreadGroup,
    type OpenThreadState,
    openThreadGroupByState,
} from './open-threads.ts';

export interface OpenThreadFacts {
    /** The Thread's newest Message; null exactly when nobody has written in it. */
    lastActivityAt: string | null;
    unreadCount: number;
    /** The viewer wrote in the Thread, wrote its anchor, or was mentioned in either. */
    viewerTookPart: boolean;
    works: readonly Pick<CloudAgentWork, 'activity' | 'job' | 'pullRequest' | 'updatedAt'>[];
}

export interface OpenThreadReading {
    /** The moment the status line's `<d>` counts from: the state's own fact. */
    at: string | null;
    /** Null while the state lasts until its job or pull request changes. */
    expiresAt: string | null;
    group: OpenThreadGroup;
    state: OpenThreadState;
}

const hour = 3_600_000;
/** A reading only a Computer reported cannot be trusted as open past this. */
const computerReadingTrustedFor = 7 * 24 * hour;

/**
 * The states the sidebar always lists: work in motion, settled work until its
 * own timer ends, and a conversation the viewer took part in. The Threads page
 * lists every state.
 */
const sidebarStates = new Set<OpenThreadState>([
    'active',
    'approved',
    'changes-requested',
    'checks-failing',
    'checks-running',
    'done',
    'draft',
    'job-failed',
    'merged',
    'needs-input',
    'pr-closed',
    'ready-for-review',
    'working',
]);

/** `unread` joins only when the viewer took part or the Thread holds work; `recent` never does. */
export function isOpenThreadInSidebar(thread: {
    jobCount: number;
    state: OpenThreadState;
    viewerTookPart: boolean;
}): boolean {
    if (thread.state === 'unread') {
        return thread.viewerTookPart || thread.jobCount > 0;
    }
    return sidebarStates.has(thread.state);
}

/**
 * The first row of the spec's state table that matches. Every job state and
 * every pull request state is named below, and each row takes its time from
 * its own record: a finished job from when it finished, a merged pull request
 * from when it merged, a conversation from its newest Message. A settled fact
 * with no recorded time is not open; nothing borrows another record's time.
 */
export function deriveOpenThreadState(facts: OpenThreadFacts, now: Date): OpenThreadReading {
    const jobs = facts.works.map((work) => jobPhase(work.job));
    const pulls = facts.works.flatMap((work) =>
        work.pullRequest ? [pullPhase(work.pullRequest, now)] : []
    );
    const open = pulls.flatMap((pull) => (pull.kind === 'open' ? [pull.reading] : []));
    const live = jobs.filter((job) => job.kind === 'live');
    const lastWrite = facts.lastActivityAt;

    if (facts.unreadCount > 0) {
        return reading('unread', lastWrite, null);
    }
    const failed = newest(jobs.flatMap((job) => (job.kind === 'failed' && job.at ? [job.at] : [])));
    if (jobs.some((job) => job.kind === 'failed') && live.length === 0) {
        return timed('job-failed', failed, 24, now);
    }
    if (open.some((pull) => pull.checks === 'failing')) {
        return reading('checks-failing', null, null);
    }
    if (open.some((pull) => pull.review === 'changes-requested')) {
        return reading('changes-requested', null, null);
    }
    if (open.some((pull) => pull.review === 'approved' && pull.checks !== 'pending')) {
        return reading('approved', null, null);
    }
    if (
        open.some(
            (pull) =>
                pull.review === 'none' && (pull.checks === 'passing' || pull.checks === 'none')
        )
    ) {
        return reading('ready-for-review', null, null);
    }
    if (live.length > 0) {
        return reading('working', oldest(live.flatMap((job) => job.startedAt ?? [])), null);
    }
    if (jobs.some((job) => job.kind === 'needs-input')) {
        return reading('needs-input', null, null);
    }
    if (open.some((pull) => pull.checks === 'pending')) {
        return reading('checks-running', null, null);
    }
    if (pulls.some((pull) => pull.kind === 'draft')) {
        return reading('draft', null, null);
    }
    const merged = pulls.filter((pull) => pull.kind === 'merged');
    if (merged.length > 0 && open.length === 0) {
        return timed('merged', newest(merged.flatMap((pull) => pull.at ?? [])), 12, now);
    }
    const closed = pulls.filter((pull) => pull.kind === 'closed');
    if (closed.length > 0 && open.length === 0) {
        return timed('pr-closed', newest(closed.flatMap((pull) => pull.at ?? [])), 12, now);
    }
    if (jobs.length > 0 && jobs.every((job) => job.kind === 'settled')) {
        return timed('done', newest(jobs.flatMap((job) => job.at ?? [])), 24, now);
    }
    return timed(facts.viewerTookPart ? 'active' : 'recent', lastWrite, 24, now);
}

/** A reading past its `expiresAt` leaves the sidebar on its next render. */
export function isOpenThreadExpired(thread: { expiresAt: string | null }, now: Date): boolean {
    return thread.expiresAt !== null && Date.parse(thread.expiresAt) <= now.getTime();
}

type JobPhase =
    | { kind: 'failed'; at: string | null }
    | { kind: 'live'; startedAt: string | null }
    | { kind: 'needs-input' }
    | { kind: 'settled'; at: string | null };

function jobPhase(job: CloudAgentJob): JobPhase {
    switch (job.state) {
        case 'working':
            return { kind: 'live', startedAt: job.startedAt };
        case 'pending-input':
            return { kind: 'needs-input' };
        case 'failed':
            return { at: job.settledAt, kind: 'failed' };
        case 'done':
        case 'cancelled':
        case 'expired':
            return { at: job.settledAt, kind: 'settled' };
        default:
            return unreachable(job);
    }
}

type PullPhase =
    | { kind: 'closed'; at: string | null }
    | { kind: 'draft' }
    | { kind: 'merged'; at: string | null }
    | { kind: 'open'; reading: CloudAgentPullRequestReading }
    | { kind: 'untrusted' };

function pullPhase(reading: CloudAgentPullRequestReading, now: Date): PullPhase {
    switch (reading.state) {
        case 'open':
        case 'draft': {
            const trusted =
                reading.source === 'github' ||
                now.getTime() - Date.parse(reading.observedAt) < computerReadingTrustedFor;
            if (!trusted) {
                return { kind: 'untrusted' };
            }
            return reading.state === 'draft' ? { kind: 'draft' } : { kind: 'open', reading };
        }
        case 'merged':
            return { at: reading.settledAt, kind: 'merged' };
        case 'closed':
            return { at: reading.settledAt, kind: 'closed' };
        default:
            return unreachable(reading.state);
    }
}

function reading(state: OpenThreadState, at: string | null, expiresAt: string | null) {
    return { at, expiresAt, group: openThreadGroupByState[state], state };
}

/** A state that lasts a fixed time from its own fact; with no fact it is already over. */
function timed(state: OpenThreadState, at: string | null, hours: number, now: Date) {
    const expiresAt = at === null ? now : new Date(Date.parse(at) + hours * hour);
    return reading(state, at, expiresAt.toISOString());
}

function newest(dates: readonly string[]): string | null {
    return [...dates].sort().at(-1) ?? null;
}

function oldest(dates: readonly string[]): string | null {
    return [...dates].sort()[0] ?? null;
}

function unreachable(value: never): never {
    throw new Error(`Unhandled Open Threads input: ${JSON.stringify(value)}`);
}
