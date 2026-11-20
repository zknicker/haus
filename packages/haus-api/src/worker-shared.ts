import * as z from 'zod';
import { workerTurnModelSchema } from './cloud-agent-model.ts';
import { workerJobSchema } from './worker-job.ts';
import {
    workerOutcomeSchema,
    workerStatusSchema,
    workerTurnInputSchema,
} from './worker-outcome.ts';
import { workerPlaceViewSchema } from './worker-place.ts';
import { workerProviderResultSchema } from './worker-provider-result.ts';
import { pullRequestReadingSchema, workerPullRequestSchema } from './worker-pull-request.ts';
import { workerModelSchema, workerRuntimeSchema } from './worker-runtime.ts';
import { workerStallCodeSchema } from './worker-stall.ts';
import { workerStepsSchema } from './worker-steps.ts';
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
export {
    type WorkerProviderResult,
    workerProviderResultMaxLength,
    workerProviderResultSchema,
} from './worker-provider-result.ts';
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

export const workerBranchNameSchema = z.string().trim().min(1).max(300);

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
        branch: workerBranchNameSchema,
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

/** Who asked to stop a turn: a person who can read the Task, or the delegating Agent. */
export const workerStopRequestedBySchema = z.discriminatedUnion('kind', [
    z.object({ id: workerIdSchema, kind: z.literal('agent') }).strict(),
    z.object({ id: workerIdSchema, kind: z.literal('user') }).strict(),
]);

/**
 * One turn of a Worker, newest first and bounded. `status` is the provider's
 * vocabulary; `outcome` is set exactly when the turn settled. `input` is null
 * only on a migrated turn whose follow-up still sits on its carrier.
 */
export const workerTurnSchema = z
    .object({
        acknowledgedAt: workerTimestampSchema.nullable(),
        branches: z.array(workerBranchSchema).max(50),
        /** When the turn was queued. */
        createdAt: workerTimestampSchema,
        /** When the Server sent the turn to its place; it holds a slot until it settles. */
        dispatchedAt: workerTimestampSchema.nullable(),
        errorCode: z.string().trim().min(1).max(120).nullable(),
        input: z.array(workerTurnInputSchema).nullable(),
        model: workerTurnModelSchema,
        outcome: workerOutcomeSchema.nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        rawStatus: z.string().trim().min(1).max(120).nullable(),
        /** The full provider result `summary` was cut from; null until a turn observes one. */
        report: workerProviderResultSchema.nullable(),
        startedAt: workerTimestampSchema.nullable(),
        stall: z
            .object({ code: workerStallCodeSchema, since: workerTimestampSchema })
            .strict()
            .nullable(),
        status: workerTurnStatusSchema,
        /** The carrier's step summary; absent until the carrier reports one (W3). */
        steps: workerStepsSchema.optional(),
        stopRequestedAt: workerTimestampSchema.nullable(),
        stopRequestedBy: workerStopRequestedBySchema.nullable(),
        summary: z.string().trim().min(1).max(workerSummaryMaxLength).nullable(),
        terminalAt: workerTimestampSchema.nullable(),
        turnId: workerIdSchema,
        usage: workerUsageSchema.nullable(),
    })
    .strict();

/**
 * One Worker (specs/workers.md "Record"): a scoped run attached to one Task.
 * `taskId` is null only on read-only history from before ADR 0053, the one
 * case `originChatId` and `launchMessageId` still point somewhere. It stores
 * provider-safe identifiers and bounded state only: credentials, raw
 * transcripts, and hosted workspace files never reach the Server.
 */
export const workerSchema = z
    .object({
        activity: workerActivitySchema.nullable(),
        agentId: workerIdSchema,
        /** The branch the Worker or its provider reported, or a Computer place's checkout branch. */
        branch: workerBranchNameSchema.nullable(),
        carrierComputerId: workerIdSchema,
        closedAt: workerTimestampSchema.nullable(),
        closingAt: workerTimestampSchema.nullable(),
        createdAt: workerTimestampSchema,
        /** The Claude cloud environment this Worker's session launched on; null off Claude. */
        environmentId: z.string().trim().min(1).max(200).nullable(),
        /** The environment's name, when the carrier could read it, for display. */
        environmentName: z.string().trim().min(1).max(200).nullable(),
        id: workerIdSchema,
        /** The Server's reading of the whole job across its turns (`deriveWorkerJob`). */
        job: workerJobSchema,
        launchMessageId: workerIdSchema.nullable(),
        /** As requested; null is the runtime's own default. Computer places only. */
        model: workerModelSchema.nullable(),
        originChatId: workerIdSchema.nullable(),
        place: workerPlaceViewSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerUrl: z.url().max(2000).nullable(),
        /** The live reading of the pull request the newest reporting turn named. */
        pullRequest: pullRequestReadingSchema.nullable(),
        repository: workerRepositorySchema,
        runtime: workerRuntimeSchema.nullable(),
        startedAt: workerTimestampSchema.nullable(),
        startingRef: workerRefSchema.nullable(),
        status: workerStatusSchema,
        taskId: workerIdSchema.nullable(),
        terminalAt: workerTimestampSchema.nullable(),
        title: workerTitleSchema,
        turns: z.array(workerTurnSchema).max(workerTurnsRetained),
        updatedAt: workerTimestampSchema,
        /** The `agents/<handle>/WORKER.md` revision the place last acknowledged receiving. */
        workerMdRevisionId: workerIdSchema.nullable(),
    })
    .strict();

export type WorkerBranch = z.infer<typeof workerBranchSchema>;
export type WorkerStopRequestedBy = z.infer<typeof workerStopRequestedBySchema>;
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
