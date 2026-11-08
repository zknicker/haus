import * as z from 'zod';
import { cloudAgentJobSchema } from './cloud-agent-job.ts';
import { cloudAgentRunModelSchema } from './cloud-agent-model.ts';
import { cloudAgentProviderSchema } from './cloud-agent-provider.ts';
import { cloudAgentStallCodeSchema } from './cloud-agent-stall.ts';
import { cloudAgentTimestampSchema } from './cloud-agent-time.ts';

const cloudAgentIdSchema = z.string().trim().min(1);

export const cloudAgentTitleMaxLength = 120;
export const cloudAgentActivityMaxLength = 120;
export const cloudAgentSummaryMaxLength = 2000;
export const cloudAgentRunsRetained = 20;

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
    type CloudAgentUnreadyReason,
    cloudAgentUnreadyReasonSchema,
    cloudAgentUnreadyReasons,
} from './cloud-agent-unready-reason.ts';

export const cloudAgentStatuses = [
    'queued',
    'running',
    'pending_input',
    'completed',
    'failed',
    'cancelled',
    'expired',
] as const;

export const cloudAgentStatusSchema = z.enum(cloudAgentStatuses);

/**
 * A Run is settled once its provider stops working on it. `pending_input` is
 * settled too: the hosted agent stopped to ask a question, and the delegating
 * Agent answers with a follow-up Run, exactly as it would after `completed`.
 */
export const cloudAgentTerminalStatuses = [
    'pending_input',
    'completed',
    'failed',
    'cancelled',
    'expired',
] as const;

export function isTerminalCloudAgentStatus(status: CloudAgentStatus): boolean {
    return (cloudAgentTerminalStatuses as readonly string[]).includes(status);
}

/** `owner/name`, the only repository shape Haus records. There is no registry. */
export const cloudAgentRepositorySchema = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u, 'A repository reads as owner/name.');

export const cloudAgentRefSchema = z.string().trim().min(1).max(200);

export const cloudAgentTitleSchema = z.string().trim().min(1).max(cloudAgentTitleMaxLength);

/** One bounded line of current state, never a transcript. */
export const cloudAgentActivitySchema = z
    .object({
        at: cloudAgentTimestampSchema,
        summary: z.string().trim().min(1).max(cloudAgentActivityMaxLength),
    })
    .strict();

/**
 * The repository a reported branch belongs to. A provider names it in whatever
 * shape its own Git metadata carries, so this is wider than the repository
 * Haus was asked to work in: `owner/name` on GitHub, and the host-qualified
 * `host/owner/name` anywhere else, so branch evidence off GitHub survives
 * instead of being dropped for want of a shape.
 */
export const cloudAgentBranchRepositorySchema = z
    .string()
    .trim()
    .min(3)
    .max(200)
    .regex(
        /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){1,4}$/u,
        'A branch repository reads as owner/name, or host/owner/name off GitHub.'
    );

/**
 * How GitHub reports a pull request's own lifecycle. `draft` and `open` are
 * both live and `merged` and `closed` are both finished, and each pair reads
 * differently to a human, so none of them collapse into one another.
 */
export const cloudAgentPullRequestStates = ['draft', 'open', 'merged', 'closed'] as const;

export const cloudAgentPullRequestStateSchema = z.enum(cloudAgentPullRequestStates);

/**
 * One GitHub reading of the pull request a Run opened, taken by the Computer
 * at observation time. Cursor's own API carries no diff statistics, so the
 * Computer reads them where they exist. This is provider-observation evidence
 * on the Run, frozen once the Run settles; `cloudAgentPullRequestReadingSchema`
 * is what stays live. `observedAt` dates the reading, so a newer snapshot
 * replaces an older one and a Run that could not be read keeps the snapshot it
 * already had.
 */
export const cloudAgentPullRequestSchema = z
    .object({
        additions: z.number().int().nonnegative(),
        changedFiles: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        number: z.number().int().positive(),
        observedAt: cloudAgentTimestampSchema,
        state: cloudAgentPullRequestStateSchema,
    })
    .strict();

/** Rollups of a pull request's checks and reviews; `unknown` until GitHub is read. */
export const cloudAgentPullRequestCheckStates = [
    'none',
    'pending',
    'passing',
    'failing',
    'unknown',
] as const;
export const cloudAgentPullRequestReviewStates = [
    'none',
    'approved',
    'changes-requested',
    'unknown',
] as const;

/**
 * The Server's live reading of a pull request some Cloud Agent work reported
 * (specs/open-threads.md). It stays evidence: Haus never acts on the pull
 * request. A `computer` reading is the Run's snapshot, frozen once the Run
 * settled; a `github` one is kept current by webhooks.
 */
export const cloudAgentPullRequestReadingSchema = cloudAgentPullRequestSchema.extend({
    checks: z.enum(cloudAgentPullRequestCheckStates),
    headSha: z.string().min(1).max(100).nullable(),
    repository: z.string().min(1).max(300),
    review: z.enum(cloudAgentPullRequestReviewStates),
    /** When GitHub merged or closed it; null while it is open or was never read. */
    settledAt: cloudAgentTimestampSchema.nullable(),
    source: z.enum(['computer', 'github']),
    /** Null until GitHub is read: a Run's snapshot carries no title. */
    title: z.string().min(1).max(1000).nullable(),
    url: z.url().max(2000),
});

/**
 * Cursor's own terminal Run report, retained as evidence. `pullRequest` is the
 * Computer's own GitHub reading of `pullRequestUrl`; absent and `null` both
 * mean no snapshot was ever recorded for this branch.
 */
export const cloudAgentBranchSchema = z
    .object({
        branch: z.string().trim().min(1).max(300),
        pullRequest: cloudAgentPullRequestSchema.nullable().optional(),
        pullRequestUrl: z.url().max(2000).nullable(),
        repository: cloudAgentBranchRepositorySchema,
    })
    .strict();

export const cloudAgentUsageSchema = z
    .object({
        costUsd: z.number().nonnegative().nullable(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
    })
    .strict();

/** Who asked for cancellation. Humans and the delegating Agent may both ask. */
export const cloudAgentCancelRequestedBySchema = z.discriminatedUnion('kind', [
    z.object({ id: cloudAgentIdSchema, kind: z.literal('agent') }).strict(),
    z.object({ id: cloudAgentIdSchema, kind: z.literal('user') }).strict(),
]);

/** One provider Run inside a work record. Newest first, and bounded. */
export const cloudAgentRunSchema = z
    .object({
        branches: z.array(cloudAgentBranchSchema).max(50),
        /** When the Run was queued: the job's start, or when a follow-up was sent. */
        createdAt: cloudAgentTimestampSchema,
        errorCode: z.string().trim().min(1).max(120).nullable(),
        model: cloudAgentRunModelSchema,
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        rawStatus: z.string().trim().min(1).max(120).nullable(),
        runId: cloudAgentIdSchema,
        startedAt: cloudAgentTimestampSchema.nullable(),
        stall: z
            .object({ code: cloudAgentStallCodeSchema, since: cloudAgentTimestampSchema })
            .strict()
            .nullable(),
        status: cloudAgentStatusSchema,
        summary: z.string().trim().min(1).max(cloudAgentSummaryMaxLength).nullable(),
        terminalAt: cloudAgentTimestampSchema.nullable(),
        usage: cloudAgentUsageSchema.nullable(),
    })
    .strict();

/**
 * The durable record one Cloud Agent work Message anchors. The Message owns
 * authorship and Chat placement; this record owns execution state. It stores
 * provider-safe identifiers and bounded state only — prompts, credentials, raw
 * transcripts, and hosted workspace files never reach Server.
 */
export const cloudAgentWorkSchema = z
    .object({
        activity: cloudAgentActivitySchema.nullable(),
        agentId: cloudAgentIdSchema,
        cancelRequestedAt: cloudAgentTimestampSchema.nullable(),
        cancelRequestedBy: cloudAgentCancelRequestedBySchema.nullable(),
        chatId: cloudAgentIdSchema,
        computerId: cloudAgentIdSchema,
        createdAt: cloudAgentTimestampSchema,
        /** The Claude cloud environment this work's session launched on; null off Claude. */
        environmentId: z.string().trim().min(1).max(200).nullable(),
        /** The environment's name, when the Computer could read it, for display. */
        environmentName: z.string().trim().min(1).max(200).nullable(),
        id: cloudAgentIdSchema,
        /** The Server's reading of the whole job across its Runs (`deriveCloudAgentJob`). */
        job: cloudAgentJobSchema,
        messageId: cloudAgentIdSchema,
        /** The live reading of the pull request the newest reporting Run named. */
        pullRequest: cloudAgentPullRequestReadingSchema.nullable(),
        provider: cloudAgentProviderSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerUrl: z.url().max(2000).nullable(),
        repository: cloudAgentRepositorySchema,
        runs: z.array(cloudAgentRunSchema).max(cloudAgentRunsRetained),
        startedAt: cloudAgentTimestampSchema.nullable(),
        startingRef: cloudAgentRefSchema.nullable(),
        status: cloudAgentStatusSchema,
        terminalAt: cloudAgentTimestampSchema.nullable(),
        title: cloudAgentTitleSchema,
        updatedAt: cloudAgentTimestampSchema,
    })
    .strict();

export type CloudAgentBranch = z.infer<typeof cloudAgentBranchSchema>;
export type CloudAgentPullRequest = z.infer<typeof cloudAgentPullRequestSchema>;
export type CloudAgentPullRequestReading = z.infer<typeof cloudAgentPullRequestReadingSchema>;
export type CloudAgentPullRequestState = z.infer<typeof cloudAgentPullRequestStateSchema>;
export type CloudAgentCancelRequestedBy = z.infer<typeof cloudAgentCancelRequestedBySchema>;
export type CloudAgentRun = z.infer<typeof cloudAgentRunSchema>;
export type CloudAgentStatus = z.infer<typeof cloudAgentStatusSchema>;
export type CloudAgentUsage = z.infer<typeof cloudAgentUsageSchema>;
export type CloudAgentWork = z.infer<typeof cloudAgentWorkSchema>;

/**
 * The envelope suffix every surface that prints a Message appends after the
 * claim suffix, from this one formatting owner
 * (specs/haus-cli.md#4-envelopes-and-message-lines).
 */
export function formatCloudAgentWorkSuffix(work: {
    pullRequestNumber?: number | null;
    status: CloudAgentStatus;
    title: string;
}): string {
    const pullRequest = work.pullRequestNumber ? ` pr=#${work.pullRequestNumber}` : '';
    return ` [cloud-agent-work status=${work.status} title=${work.title}${pullRequest}]`;
}

/** A GitHub pull request URL's lower-cased `owner/name` and number; null for any other URL. */
export function parseGithubPullRequestUrl(
    url: string
): { number: number; repository: string } | null {
    const matched = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/u.exec(url);
    return matched?.[1] && matched[2]
        ? { number: Number(matched[2]), repository: matched[1].toLowerCase() }
        : null;
}

/**
 * The pull-request number a GitHub-shaped URL names. One owner for the parse,
 * so every surface that prints `pr=#<n>` reads the same digits out of the same
 * URL Cursor reported.
 */
export function cloudAgentPullRequestNumber(pullRequestUrl: string): number | null {
    const matched = /\/pull(?:s|-requests)?\/(\d+)(?:[/?#]|$)/u.exec(pullRequestUrl);
    const number = matched ? Number.parseInt(matched[1] as string, 10) : Number.NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
