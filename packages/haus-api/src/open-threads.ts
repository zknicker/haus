import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import type { CloudAgentPullRequestReading, CloudAgentWork } from './cloud-agent-shared.ts';

/** Who holds a Thread right now (specs/open-threads.md). Not an attention tier: no badge, no notice. */
export const openThreadGroups = ['with-you', 'with-agents', 'recent'] as const;
export type OpenThreadGroup = (typeof openThreadGroups)[number];

const groupByState = {
    approved: 'with-you',
    'changes-requested': 'with-you',
    'checks-failing': 'with-you',
    'checks-running': 'with-agents',
    done: 'recent',
    draft: 'with-agents',
    'job-failed': 'with-you',
    merged: 'recent',
    'needs-input': 'with-agents',
    'pr-closed': 'recent',
    'ready-for-review': 'with-you',
    recent: 'recent',
    unread: 'with-you',
    waiting: 'with-agents',
    working: 'with-agents',
} as const satisfies Record<string, OpenThreadGroup>;

export type OpenThreadState = keyof typeof groupByState;

const openThreadStateSchema = z.enum(
    Object.keys(groupByState) as [OpenThreadState, ...OpenThreadState[]]
);

export const openThreadSchema = z
    .object({
        /** The author behind an `unread` or `recent` line, or the Agent a `waiting` line names. */
        actorName: z.string().min(1).nullable(),
        anchorMessageId: idSchema,
        /** The moment the status line's `<d>` counts from. */
        at: timestampSchema.nullable(),
        /** Null while the state lasts until its job or pull request changes. */
        expiresAt: timestampSchema.nullable(),
        group: z.enum(openThreadGroups),
        jobCount: z.number().int().nonnegative(),
        lastActivityAt: timestampSchema.nullable(),
        liveJobCount: z.number().int().nonnegative(),
        mentionsViewer: z.boolean(),
        parentChatId: idSchema,
        state: openThreadStateSchema,
        threadChatId: idSchema,
        title: z.string().min(1),
        /** The newest word from a live job; past ten minutes a `working` line says so. */
        updatedAt: timestampSchema.nullable(),
    })
    .strict();

export type OpenThread = z.infer<typeof openThreadSchema>;

export const threadScopeInputSchema = z.object({ serverId: idSchema }).strict();

export const openThreadListSchema = z
    .object({
        /** Threads the viewer closed; the band offers Reopen on these. */
        closedThreadChatIds: z.array(idSchema),
        threads: z.array(openThreadSchema),
    })
    .strict();

/** Not strict: a tRPC infinite query adds its own `direction` to the input. */
export const earlierThreadsInputSchema = z.object({
    cursor: z.number().int().nonnegative().nullish(),
    scope: z.enum(['following', 'all']),
    serverId: idSchema,
});

export const earlierThreadListSchema = z
    .object({
        nextCursor: z.number().int().positive().nullable(),
        threads: z.array(openThreadSchema),
    })
    .strict();

export const threadClosedInputSchema = z
    .object({ closed: z.boolean(), serverId: idSchema, threadChatId: idSchema })
    .strict();

export type EarlierThreadsScope = z.infer<typeof earlierThreadsInputSchema>['scope'];

export interface OpenThreadFacts {
    lastActivityAt: string | null;
    unreadCount: number;
    viewerWroteLast: boolean;
    works: readonly Pick<
        CloudAgentWork,
        'activity' | 'createdAt' | 'job' | 'pullRequest' | 'updatedAt'
    >[];
}

export interface OpenThreadReading {
    at: string | null;
    expiresAt: string | null;
    group: OpenThreadGroup;
    state: OpenThreadState;
}

const hour = 3_600_000;
/** A reading only a Computer reported cannot be trusted as open past this. */
const computerReadingTrustedFor = 7 * 24 * hour;

/**
 * The first row of the spec's state table that matches. One pure function, so
 * every client reads a Thread the same way. A Thread with several jobs or pull
 * requests reads them all and takes the most urgent.
 */
export function deriveOpenThreadState(facts: OpenThreadFacts, now: Date): OpenThreadReading {
    const lastWrite = facts.lastActivityAt;
    const read = (state: OpenThreadState, at: string | null, expiresAt: string | null) => ({
        at,
        expiresAt,
        group: groupByState[state],
        state,
    });
    const afterLastWrite = (state: OpenThreadState) =>
        read(state, lastWrite, later(lastWrite, 24 * hour));

    if (facts.unreadCount > 0) {
        return read('unread', lastWrite, null);
    }

    const live = facts.works.filter((work) => work.job.state === 'working');
    const failedAlone = facts.works.some(
        (work) =>
            work.job.state === 'failed' && !live.some((other) => other.createdAt > work.createdAt)
    );
    if (failedAlone) {
        return afterLastWrite('job-failed');
    }

    const readings = facts.works.flatMap((work) => work.pullRequest ?? []);
    const open = readings.filter((reading) => isOpen(reading, now));
    const ready = open.filter((reading) => reading.state === 'open');
    if (ready.some((reading) => reading.checks === 'failing')) {
        return read('checks-failing', null, null);
    }
    if (ready.some((reading) => reading.review === 'changes-requested')) {
        return read('changes-requested', null, null);
    }
    if (ready.some((reading) => reading.review === 'approved' && reading.checks !== 'pending')) {
        return read('approved', null, null);
    }
    if (
        ready.some(
            (reading) =>
                reading.review === 'none' &&
                (reading.checks === 'passing' || reading.checks === 'none')
        )
    ) {
        return read('ready-for-review', null, null);
    }
    if (live.length > 0) {
        return read('working', earliest(live.map(workStartedAt)), null);
    }
    if (facts.works.some((work) => work.job.state === 'pending-input')) {
        return read('needs-input', null, null);
    }
    if (ready.some((reading) => reading.checks === 'pending')) {
        return read('checks-running', null, null);
    }
    if (open.some((reading) => reading.state === 'draft')) {
        return read('draft', null, null);
    }
    if (facts.viewerWroteLast) {
        return afterLastWrite('waiting');
    }
    if (open.length === 0) {
        const merged = settledAt(readings, 'merged');
        if (merged) {
            return read('merged', merged, later(merged, 12 * hour));
        }
        const closed = settledAt(readings, 'closed');
        if (closed) {
            return read('pr-closed', closed, later(closed, 12 * hour));
        }
    }
    return afterLastWrite(facts.works.length > 0 && readings.length === 0 ? 'done' : 'recent');
}

/** A reading past its `expiresAt` leaves the sidebar on its next render. */
export function isOpenThreadExpired(thread: { expiresAt: string | null }, now: Date): boolean {
    return thread.expiresAt !== null && Date.parse(thread.expiresAt) <= now.getTime();
}

/** The Thread's title: its oldest work's title, else the anchor's first plain line. */
export function threadTitle(input: {
    anchorContent: string | null;
    oldestWorkTitle: string | null;
}): string {
    if (input.oldestWorkTitle) {
        return input.oldestWorkTitle;
    }
    const line = (input.anchorContent ?? '')
        .replace(/\[([^\]\n]*)\]\([^)\s]*\)/gu, '$1')
        .split('\n')
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0);
    return line ? line.slice(0, 80).trim() : 'Thread';
}

function isOpen(reading: CloudAgentPullRequestReading, now: Date) {
    if (reading.state !== 'open' && reading.state !== 'draft') {
        return false;
    }
    return (
        reading.source === 'github' ||
        now.getTime() - Date.parse(reading.observedAt) < computerReadingTrustedFor
    );
}

function settledAt(
    readings: readonly CloudAgentPullRequestReading[],
    state: 'closed' | 'merged'
): string | null {
    const dates = readings.flatMap((reading) =>
        reading.state === state && reading.settledAt ? [reading.settledAt] : []
    );
    return dates.sort().at(-1) ?? null;
}

function workStartedAt(work: OpenThreadFacts['works'][number]): string {
    return work.job.state === 'working' && work.job.startedAt ? work.job.startedAt : work.createdAt;
}

function earliest(dates: string[]): string | null {
    return [...dates].sort()[0] ?? null;
}

function later(from: string | null, by: number): string | null {
    return from === null ? null : new Date(Date.parse(from) + by).toISOString();
}
