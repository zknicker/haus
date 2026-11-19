import * as z from 'zod';
import { workerTurnModelSchema } from './cloud-agent-model.ts';
import { cloudAgentProviderSchema } from './cloud-agent-provider.ts';
import { workerJobSchema } from './worker-job.ts';
import { pullRequestReadingSchema, workerPullRequestSchema } from './worker-pull-request.ts';
import { workerReportSchema } from './worker-report.ts';
import { workerStallCodeSchema } from './worker-stall.ts';
import { workerTimestampSchema } from './worker-time.ts';

const workerIdSchema = z.string().trim().min(1);

export const workerTitleMaxLength = 120;
export const workerActivityMaxLength = 120;
export const workerSummaryMaxLength = 2000;
export const workerTurnsRetained = 20;

export {
    type CloudAgentCapabilityState,
    cloudAgentCapabilityStateSchema,
} from './cloud-agent-capability.ts';
export {
    type CloudAgentEnvironment,
    cloudAgentEnvironmentSchema,
} from './cloud-agent-environment.ts';
export {
    type CloudAgentProvider,
    cloudAgentProviderSchema,
    cloudAgentProviders,
} from './cloud-agent-provider.ts';
export {
    type WorkerPullRequest,
    type PullRequestReading,
    type WorkerPullRequestState,
    workerPullRequestCheckStates,
    workerPullRequestNumber,
    pullRequestReadingSchema,
    workerPullRequestReviewStates,
    workerPullRequestSchema,
    workerPullRequestStateSchema,
    workerPullRequestStates,
    parseGithubPullRequestUrl,
} from './worker-pull-request.ts';
export { type WorkerReport, workerReportMaxLength, workerReportSchema } from './worker-report.ts';
export {
    type CloudAgentUnreadyReason,
    cloudAgentUnreadyReasonSchema,
    cloudAgentUnreadyReasons,
} from './cloud-agent-unready-reason.ts';

export const workerTurnStatuses = [
    'queued',
    'running',
    'pending_input',
    'completed',
    'failed',
    'cancelled',
    'expired',
] as const;

export const workerTurnStatusSchema = z.enum(workerTurnStatuses);

/**
 * A Run is settled once its provider stops working on it. `pending_input` is
 * settled too: the hosted agent stopped to ask a question, and the delegating
 * Agent answers with a follow-up Run, exactly as it would after `completed`.
 */
export const workerTurnTerminalStatuses = [
    'pending_input',
    'completed',
    'failed',
    'cancelled',
    'expired',
] as const;

export function isTerminalWorkerTurnStatus(status: WorkerTurnStatus): boolean {
    return (workerTurnTerminalStatuses as readonly string[]).includes(status);
}

/** `owner/name`, the only repository shape Haus records. There is no registry. */
export const workerRepositorySchema = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u, 'A repository reads as owner/name.');

export const workerRefSchema = z.string().trim().min(1).max(200);

export const workerTitleSchema = z.string().trim().min(1).max(workerTitleMaxLength);

/** One bounded line of current state, never a transcript. */
export const workerActivitySchema = z
    .object({
        at: workerTimestampSchema,
        summary: z.string().trim().min(1).max(workerActivityMaxLength),
    })
    .strict();

/**
 * The repository a reported branch belongs to. A provider names it in whatever
 * shape its own Git metadata carries, so this is wider than the repository
 * Haus was asked to work in: `owner/name` on GitHub, and the host-qualified
 * `host/owner/name` anywhere else, so branch evidence off GitHub survives
 * instead of being dropped for want of a shape.
 */
export const workerBranchRepositorySchema = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(
        /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){1,4}$/u,
        'A branch repository reads as owner/name, or host/owner/name off GitHub.'
    );

/**
 * Cursor's own terminal Run report, retained as evidence. `pullRequest` is the
 * Computer's own GitHub reading of `pullRequestUrl`; absent and `null` both
 * mean no snapshot was ever recorded for this branch.
 */
export const workerBranchSchema = z
    .object({
        branch: z.string().trim().min(1).max(300),
        pullRequest: workerPullRequestSchema.nullable().optional(),
        pullRequestUrl: z.url().max(2000).nullable(),
        repository: workerBranchRepositorySchema,
    })
    .strict();

export const workerUsageSchema = z
    .object({
        costUsd: z.number().nonnegative().nullable(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
    })
    .strict();

/** Who asked for cancellation. Humans and the delegating Agent may both ask. */
export const workerCancelRequestedBySchema = z.discriminatedUnion('kind', [
    z.object({ id: workerIdSchema, kind: z.literal('agent') }).strict(),
    z.object({ id: workerIdSchema, kind: z.literal('user') }).strict(),
]);

/** One provider Run inside a work record. Newest first, and bounded. */
export const workerTurnSchema = z
    .object({
        branches: z.array(workerBranchSchema).max(50),
        /** When the Run was queued: the job's start, or when a follow-up was sent. */
        createdAt: workerTimestampSchema,
        errorCode: z.string().trim().min(1).max(120).nullable(),
        model: workerTurnModelSchema,
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        rawStatus: z.string().trim().min(1).max(120).nullable(),
        /** The full report `summary` was cut from; null until a Run observes one. */
        report: workerReportSchema.nullable(),
        runId: workerIdSchema,
        startedAt: workerTimestampSchema.nullable(),
        stall: z
            .object({ code: workerStallCodeSchema, since: workerTimestampSchema })
            .strict()
            .nullable(),
        status: workerTurnStatusSchema,
        summary: z.string().trim().min(1).max(workerSummaryMaxLength).nullable(),
        terminalAt: workerTimestampSchema.nullable(),
        usage: workerUsageSchema.nullable(),
    })
    .strict();

/**
 * The durable record one Worker Message anchors. The Message owns
 * authorship and Chat placement; this record owns execution state. It stores
 * provider-safe identifiers and bounded state only — prompts, credentials, raw
 * transcripts, and hosted workspace files never reach Server.
 */
export const workerSchema = z
    .object({
        activity: workerActivitySchema.nullable(),
        agentId: workerIdSchema,
        cancelRequestedAt: workerTimestampSchema.nullable(),
        cancelRequestedBy: workerCancelRequestedBySchema.nullable(),
        chatId: workerIdSchema,
        computerId: workerIdSchema,
        createdAt: workerTimestampSchema,
        /** The Claude cloud environment this work's session launched on; null off Claude. */
        environmentId: z.string().trim().min(1).max(200).nullable(),
        /** The environment's name, when the Computer could read it, for display. */
        environmentName: z.string().trim().min(1).max(200).nullable(),
        id: workerIdSchema,
        /** The Server's reading of the whole job across its Runs (`deriveWorkerJob`). */
        job: workerJobSchema,
        messageId: workerIdSchema,
        /** The live reading of the pull request the newest reporting Run named. */
        pullRequest: pullRequestReadingSchema.nullable(),
        provider: cloudAgentProviderSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerUrl: z.url().max(2000).nullable(),
        repository: workerRepositorySchema,
        runs: z.array(workerTurnSchema).max(workerTurnsRetained),
        startedAt: workerTimestampSchema.nullable(),
        startingRef: workerRefSchema.nullable(),
        status: workerTurnStatusSchema,
        terminalAt: workerTimestampSchema.nullable(),
        title: workerTitleSchema,
        updatedAt: workerTimestampSchema,
    })
    .strict();

export type WorkerBranch = z.infer<typeof workerBranchSchema>;
export type WorkerCancelRequestedBy = z.infer<typeof workerCancelRequestedBySchema>;
export type WorkerTurn = z.infer<typeof workerTurnSchema>;
export type WorkerTurnStatus = z.infer<typeof workerTurnStatusSchema>;
export type WorkerUsage = z.infer<typeof workerUsageSchema>;
export type Worker = z.infer<typeof workerSchema>;

/**
 * The envelope suffix every surface that prints a Message appends after the
 * claim suffix, from this one formatting owner
 * (specs/haus-cli.md#4-envelopes-and-message-lines).
 */
export function formatWorkerSuffix(work: {
    pullRequestNumber?: number | null;
    status: WorkerTurnStatus;
    title: string;
}): string {
    const pullRequest = work.pullRequestNumber ? ` pr=#${work.pullRequestNumber}` : '';
    return ` [worker status=${work.status} title=${work.title}${pullRequest}]`;
}
