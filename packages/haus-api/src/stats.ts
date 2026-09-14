import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });
const usageErrorCodeSchema = z.enum(['auth', 'parse', 'request', 'unknown']);
const usageErrorSchema = z
    .object({
        code: usageErrorCodeSchema,
        message: z.string(),
        name: z.string(),
    })
    .strict();
/**
 * Why a reported `status: 'ok'` carries last-known numbers instead of current
 * ones. The Computer stamps it when it retains a provider's previous snapshot
 * past a failed read, so an expired login stays legible as a login problem
 * rather than as generic staleness. Absent means the snapshot is as fresh as
 * its `capturedAt` claims.
 */
const usageStaleSchema = z.object({ at: timestampSchema, code: usageErrorCodeSchema }).strict();
const codexUsageWindowSchema = z
    .object({
        id: z.enum(['current-session', 'current-week']),
        label: z.string(),
        remainingPercent: z.number().min(0).max(100),
        resetAfterSeconds: z.number().nonnegative().nullable(),
        resetsAt: timestampSchema.nullable(),
        usedPercent: z.number().min(0).max(100),
    })
    .strict();
const codexUsageSnapshotSchema = z
    .object({
        capturedAt: timestampSchema,
        creditsBalance: z.number().nonnegative().nullable(),
        planType: z.string().nullable(),
        provider: z.literal('codex'),
        source: z.literal('chatgpt-wham-usage'),
        windows: z.array(codexUsageWindowSchema),
    })
    .strict();
const codexUsageStateSchema = z.discriminatedUnion('status', [
    z
        .object({
            error: usageErrorSchema,
            provider: z.literal('codex'),
            status: z.literal('error'),
        })
        .strict(),
    z
        .object({
            provider: z.literal('codex'),
            snapshot: codexUsageSnapshotSchema,
            stale: usageStaleSchema.optional(),
            status: z.literal('ok'),
        })
        .strict(),
]);
const claudeUsageWindowSchema = z
    .object({
        id: z.enum([
            'current-session',
            'current-week-all-models',
            'current-week-opus',
            'current-week-sonnet',
        ]),
        label: z.string(),
        remainingPercent: z.number().min(0).max(100),
        resetsAt: timestampSchema.nullable(),
        usedPercent: z.number().min(0).max(100),
    })
    .strict();
const claudeUsageSnapshotSchema = z
    .object({
        capturedAt: timestampSchema,
        extraUsage: z
            .object({
                monthlyLimitUsd: z.number().nonnegative().nullable(),
                usedUsd: z.number().nonnegative(),
            })
            .strict()
            .nullable(),
        provider: z.literal('claude'),
        source: z.enum(['anthropic-oauth-usage', 'claude-code-sdk-usage']),
        subscriptionType: z.string().nullable(),
        windows: z.array(claudeUsageWindowSchema),
    })
    .strict();
const claudeUsageStateSchema = z.discriminatedUnion('status', [
    z
        .object({
            error: usageErrorSchema,
            provider: z.literal('claude'),
            status: z.literal('error'),
        })
        .strict(),
    z
        .object({
            provider: z.literal('claude'),
            snapshot: claudeUsageSnapshotSchema,
            stale: usageStaleSchema.optional(),
            status: z.literal('ok'),
        })
        .strict(),
]);
const grokUsageSnapshotSchema = z
    .object({
        capturedAt: timestampSchema,
        provider: z.literal('grok'),
        source: z.literal('grok-build-credits'),
        windows: z.array(
            z
                .object({
                    id: z.literal('current-period'),
                    label: z.string(),
                    remainingPercent: z.number().min(0).max(100),
                    resetsAt: timestampSchema.nullable(),
                    usedPercent: z.number().min(0).max(100),
                })
                .strict()
        ),
    })
    .strict();
const grokUsageStateSchema = z.discriminatedUnion('status', [
    z
        .object({
            error: usageErrorSchema,
            provider: z.literal('grok'),
            status: z.literal('error'),
        })
        .strict(),
    z
        .object({
            provider: z.literal('grok'),
            snapshot: grokUsageSnapshotSchema,
            stale: usageStaleSchema.optional(),
            status: z.literal('ok'),
        })
        .strict(),
]);
const openRouterOverviewSchema = z
    .object({
        days: z.number().int().nonnegative(),
        keys: z.array(
            z
                .object({
                    id: z.string(),
                    label: z.string(),
                    providerName: z.string(),
                })
                .strict()
        ),
        message: z.string().nullable(),
        note: z.string().nullable(),
        series: z.array(
            z
                .object({
                    date: z.string(),
                    values: z.record(z.string(), z.number()),
                })
                .strict()
        ),
        status: z.enum(['empty', 'ready', 'unconfigured']),
        totalByokUsageUsd: z.number().nonnegative(),
        totalRequests: z.number().int().nonnegative(),
        totalUsageUsd: z.number().nonnegative(),
    })
    .strict();
const openRouterUsageStateSchema = z
    .object({
        error: usageErrorSchema.nullable(),
        overview: openRouterOverviewSchema,
        status: z.enum(['error', 'ok']),
    })
    .strict();
const runtimeTokenTotalsSchema = z
    .object({
        cacheReadTokens: z.number().int().nonnegative(),
        cacheWriteTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    })
    .strict();
const runtimeTokenUsageSnapshotSchema = z
    .object({
        capturedAt: timestampSchema,
        days: z.literal(30),
        models: z.array(
            runtimeTokenTotalsSchema.extend({ modelId: z.string().trim().min(1) }).strict()
        ),
        runtimeId: z.enum(['claude-code', 'grok-build']),
        source: z.enum(['claude-code-jsonl', 'grok-build-jsonl']),
        totals: runtimeTokenTotalsSchema,
    })
    .strict();
const runtimeTokenUsageStateSchema = z.discriminatedUnion('status', [
    z
        .object({
            error: usageErrorSchema,
            runtimeId: z.enum(['claude-code', 'grok-build']),
            status: z.literal('error'),
        })
        .strict(),
    z
        .object({
            runtimeId: z.enum(['claude-code', 'grok-build']),
            snapshot: runtimeTokenUsageSnapshotSchema,
            status: z.literal('ok'),
        })
        .strict(),
]);

export const serverStatsInputSchema = z.object({ serverId: z.string().trim().min(1) }).strict();

/**
 * Exact pre-WS6 provider-usage payload, now transported Computer → Server →
 * App. Credentials and provider calls stay on the assigned Computer.
 */
export const usageOverviewSchema = z
    .object({
        capturedAt: timestampSchema,
        claude: claudeUsageStateSchema,
        codex: codexUsageStateSchema,
        connectedProviders: z.array(
            z.enum(['claude-code', 'grok-build', 'openai-codex', 'openrouter'])
        ),
        grok: grokUsageStateSchema,
        openRouter: openRouterUsageStateSchema,
        runtimeUsage: z.array(runtimeTokenUsageStateSchema).default([]),
    })
    .strict();

export const usageReportSchema = z
    .object({
        type: z.literal('usage-report'),
        usage: usageOverviewSchema,
    })
    .strict();

export const computerUsageSchema = z
    .object({
        architecture: z.string().nullable(),
        computerId: z.string().trim().min(1),
        health: z.enum(['degraded', 'healthy', 'offline', 'update-required']),
        operatingSystem: z.string().nullable(),
        productVersion: z.string().nullable(),
        reportedAt: timestampSchema.nullable(),
        usage: usageOverviewSchema.nullable(),
    })
    .strict();

const tokenTotalsSchema = z
    .object({
        cacheReadTokens: z.number().int().nonnegative(),
        cacheWriteTokens: z.number().int().nonnegative(),
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
    })
    .strict();

const tokenBreakdownSchema = tokenTotalsSchema.extend({
    agentAvatarUrl: z.string().nullable(),
    agentHandle: z.string(),
    agentId: z.string().trim().min(1),
    agentName: z.string(),
    date: z.iso.date(),
    modelId: z.string().trim().min(1),
    runtimeId: z.string().trim().min(1),
});

export const tokenUsageOverviewSchema = z
    .object({
        breakdown: z.array(tokenBreakdownSchema),
        days: z.literal(90),
        totals: tokenTotalsSchema,
    })
    .strict();

export const serverUsageOverviewSchema = z
    .object({
        computers: z.array(computerUsageSchema),
        tokenUsage: tokenUsageOverviewSchema,
    })
    .strict();

export type ComputerUsage = z.infer<typeof computerUsageSchema>;
export type ServerUsageOverview = z.infer<typeof serverUsageOverviewSchema>;
export type TokenUsageOverview = z.infer<typeof tokenUsageOverviewSchema>;
export type UsageOverview = z.infer<typeof usageOverviewSchema>;
export type UsageReport = z.infer<typeof usageReportSchema>;
export type UsageErrorCode = z.infer<typeof usageErrorCodeSchema>;
export type UsageStale = z.infer<typeof usageStaleSchema>;
export type RuntimeTokenUsageSnapshot = z.infer<typeof runtimeTokenUsageSnapshotSchema>;
export type RuntimeTokenUsageState = z.infer<typeof runtimeTokenUsageStateSchema>;
