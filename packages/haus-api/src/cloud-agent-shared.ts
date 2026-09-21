import * as z from 'zod';

const cloudAgentIdSchema = z.string().trim().min(1);
const cloudAgentTimestampSchema = z.iso.datetime({ offset: true });

export const cloudAgentTitleMaxLength = 120;
export const cloudAgentActivityMaxLength = 120;
export const cloudAgentSummaryMaxLength = 2000;
export const cloudAgentRunsRetained = 20;

/** Cursor is the only provider; a second one needs a real per-execution choice. */
export const cloudAgentProviders = ['cursor'] as const;

export const cloudAgentProviderSchema = z.enum(cloudAgentProviders);

/**
 * Why a Cloud Agent provider is not ready on a Computer. `not-connected` — no
 * credential resolves from explicit configuration, the environment, or the
 * provider's own credential store. `expired` — a stored credential resolved
 * but its own expiry has passed, so reconnecting is the fix rather than
 * installing anything. `provider-unavailable` — the provider SDK itself cannot
 * be reached on this Computer.
 */
export const cloudAgentUnreadyReasons = [
    'not-connected',
    'expired',
    'provider-unavailable',
] as const;

export const cloudAgentUnreadyReasonSchema = z.enum(cloudAgentUnreadyReasons);

export const cloudAgentStatuses = [
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
    'expired',
] as const;

export const cloudAgentStatusSchema = z.enum(cloudAgentStatuses);

export const cloudAgentTerminalStatuses = ['completed', 'failed', 'cancelled', 'expired'] as const;

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
 * on the Run and not a Haus product relation: Haus still stores no
 * pull-request entity and claims no GitHub lifecycle. `observedAt` dates the
 * reading, so a newer snapshot replaces an older one and a Run that could not
 * be read keeps the snapshot it already had.
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

/**
 * Cursor's own terminal Run report, retained as evidence. Haus stores no
 * branch or pull-request entity and claims no GitHub lifecycle. `pullRequest`
 * is the Computer's own GitHub reading of `pullRequestUrl`; absent and `null`
 * both mean no snapshot was ever recorded for this branch.
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
        errorCode: z.string().trim().min(1).max(120).nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        rawStatus: z.string().trim().min(1).max(120).nullable(),
        runId: cloudAgentIdSchema,
        startedAt: cloudAgentTimestampSchema.nullable(),
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
        id: cloudAgentIdSchema,
        messageId: cloudAgentIdSchema,
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

/**
 * One Cloud Agent provider capability on one Computer: whether its credential
 * store currently resolves, and the account it resolves to. It carries no
 * credential — Haus never copies a provider key into Server.
 */
export const cloudAgentCapabilityStateSchema = z
    .object({
        /** The provider account the resolved credential belongs to, when it names one. */
        accountEmail: z.string().trim().min(1).max(320).nullable(),
        /** When the resolved credential expires, when the provider dates it. */
        expiresAt: cloudAgentTimestampSchema.nullable(),
        provider: cloudAgentProviderSchema,
        ready: z.boolean(),
        reason: cloudAgentUnreadyReasonSchema.nullable(),
        signIn: z
            .discriminatedUnion('status', [
                z
                    .object({
                        status: z.literal('waiting'),
                        url: z
                            .url()
                            .max(4096)
                            .refine((value) => {
                                if (!URL.canParse(value)) {
                                    return false;
                                }
                                const url = new URL(value);
                                return (
                                    url.protocol === 'https:' &&
                                    url.hostname === 'cursor.com' &&
                                    !url.username &&
                                    !url.password &&
                                    !url.port
                                );
                            }),
                        expiresAt: cloudAgentTimestampSchema,
                    })
                    .strict(),
                z
                    .object({ status: z.literal('failed'), message: z.string().min(1).max(500) })
                    .strict(),
            ])
            .optional(),
    })
    .strict()
    .refine((value) => value.ready !== Boolean(value.reason), {
        message: 'A ready capability carries no reason, and an unready one must name its reason.',
        path: ['reason'],
    });

export type CloudAgentCapabilityState = z.infer<typeof cloudAgentCapabilityStateSchema>;

export type CloudAgentBranch = z.infer<typeof cloudAgentBranchSchema>;
export type CloudAgentPullRequest = z.infer<typeof cloudAgentPullRequestSchema>;
export type CloudAgentPullRequestState = z.infer<typeof cloudAgentPullRequestStateSchema>;
export type CloudAgentUnreadyReason = z.infer<typeof cloudAgentUnreadyReasonSchema>;
export type CloudAgentCancelRequestedBy = z.infer<typeof cloudAgentCancelRequestedBySchema>;
export type CloudAgentProvider = z.infer<typeof cloudAgentProviderSchema>;
export type CloudAgentRun = z.infer<typeof cloudAgentRunSchema>;
export type CloudAgentStatus = z.infer<typeof cloudAgentStatusSchema>;
export type CloudAgentUsage = z.infer<typeof cloudAgentUsageSchema>;
export type CloudAgentWork = z.infer<typeof cloudAgentWorkSchema>;

/**
 * The envelope suffix every surface that prints a Message appends after the
 * task and Ask suffixes, from this one formatting owner
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
