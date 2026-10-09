import * as z from 'zod';
import type { CloudAgentStatus } from './cloud-agent-shared.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A follow-up Run the delegating Agent sent after the first one. `waiting`
 * dates from when it was queued; `running` from when the provider started it.
 */
export const cloudAgentFollowUpSchema = z.discriminatedUnion('state', [
    z.object({ since: timestampSchema, state: z.literal('waiting') }).strict(),
    z.object({ since: timestampSchema, state: z.literal('running') }).strict(),
]);

/**
 * How the whole job reads: Cursor's own status for the newest Run Cursor has
 * received, in Cursor's vocabulary (`done` is FINISHED, `failed` ERROR,
 * `cancelled` CANCELLED, `expired` EXPIRED). A follow-up still in Haus's local
 * queue is not a Cursor Run yet, so it never moves the job, and `queued` is
 * never a job state: a job whose first Run has not started yet is `working`.
 * `startedAt` and `settledAt` belong to the Run the state comes from. A
 * `failed` job carries that Run's own report.
 */
export const cloudAgentJobSchema = z.discriminatedUnion('state', [
    z
        .object({
            followUp: cloudAgentFollowUpSchema.nullable(),
            startedAt: timestampSchema.nullable(),
            state: z.literal('working'),
        })
        .strict(),
    z
        .object({
            followUp: cloudAgentFollowUpSchema.nullable(),
            settledAt: timestampSchema.nullable(),
            startedAt: timestampSchema.nullable(),
            state: z.literal('done'),
        })
        .strict(),
    z
        .object({
            errorCode: z.string().trim().min(1).max(120).nullable(),
            followUp: cloudAgentFollowUpSchema.nullable(),
            settledAt: timestampSchema.nullable(),
            state: z.literal('failed'),
            summary: z.string().trim().min(1).max(2000).nullable(),
        })
        .strict(),
    z
        .object({
            followUp: cloudAgentFollowUpSchema.nullable(),
            settledAt: timestampSchema.nullable(),
            state: z.literal('cancelled'),
        })
        .strict(),
    z
        .object({
            followUp: cloudAgentFollowUpSchema.nullable(),
            settledAt: timestampSchema.nullable(),
            state: z.literal('expired'),
        })
        .strict(),
]);

export type CloudAgentFollowUp = z.infer<typeof cloudAgentFollowUpSchema>;
export type CloudAgentJob = z.infer<typeof cloudAgentJobSchema>;
export type CloudAgentJobState = CloudAgentJob['state'];

interface JobRun {
    createdAt: string;
    errorCode: null | string;
    /** Set once Cursor has received the Run; null while it sits in Haus's local queue. */
    providerRunId: null | string;
    startedAt: null | string;
    status: CloudAgentStatus;
    summary: null | string;
    terminalAt: null | string;
}

/**
 * Derives the job from its Runs, newest first. The state comes from the newest
 * Run Cursor has received (it carries a `providerRunId`): a follow-up still in
 * Haus's local queue — or cancelled there before delivery — leaves the job as
 * that earlier Run reads. Until Cursor has received any Run, the job reads from
 * its first. A waiting or live newest Run that is not the job's first is the
 * follow-up. A work with no Run recorded reads from its own lifecycle fields.
 */
export function deriveCloudAgentJob(work: {
    runs: readonly JobRun[];
    startedAt: null | string;
    status: CloudAgentStatus;
    terminalAt: null | string;
}): CloudAgentJob {
    const [newest] = work.runs;
    if (!newest) {
        return jobFrom(
            {
                errorCode: null,
                startedAt: work.startedAt,
                status: work.status,
                summary: null,
                terminalAt: work.terminalAt,
            },
            null
        );
    }
    const followUp = work.runs.length > 1 ? followUpOf(newest) : null;
    const first = work.runs.at(-1) ?? newest;
    const anchor = work.runs.find((run) => run.providerRunId !== null) ?? first;
    return jobFrom(anchor, followUp);
}

function followUpOf(run: JobRun): CloudAgentFollowUp | null {
    if (run.status === 'queued') {
        return { since: run.createdAt, state: 'waiting' };
    }
    if (run.status === 'running') {
        return { since: run.startedAt ?? run.createdAt, state: 'running' };
    }
    return null;
}

function jobFrom(
    run: Omit<JobRun, 'createdAt' | 'providerRunId'>,
    followUp: CloudAgentFollowUp | null
): CloudAgentJob {
    switch (run.status) {
        case 'queued':
        case 'running':
            return { followUp, startedAt: run.startedAt, state: 'working' };
        case 'completed':
            return {
                followUp,
                settledAt: run.terminalAt,
                startedAt: run.startedAt,
                state: 'done',
            };
        case 'failed':
            return {
                errorCode: run.errorCode,
                followUp,
                settledAt: run.terminalAt,
                state: 'failed',
                summary: run.summary,
            };
        case 'cancelled':
        case 'expired':
            return { followUp, settledAt: run.terminalAt, state: run.status };
    }
}
