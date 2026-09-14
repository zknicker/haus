import type { ServerUsageOverview, TokenUsageOverview, UsageOverview } from '@haus/api';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { avatarUrlFor } from '../avatars/avatar-url.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, agentTokenUsageDailyTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function recordComputerUsage(
    db: HausDatabase,
    input: {
        computerId: string;
        serverId: string;
        usage: UsageOverview;
    }
) {
    await db
        .update(computersTable)
        .set({
            usageReportedAt: new Date(),
            usageSnapshot: input.usage,
        })
        .where(
            and(
                eq(computersTable.id, input.computerId),
                eq(computersTable.serverId, input.serverId)
            )
        );
}

export async function readServerUsage(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<ServerUsageOverview> {
    await requireServerMembership(db, member, serverId);
    const [computers, tokenUsage] = await Promise.all([
        db
            .select({
                architecture: computersTable.architecture,
                computerId: computersTable.id,
                health: computersTable.health,
                operatingSystem: computersTable.operatingSystem,
                productVersion: computersTable.productVersion,
                reportedAt: computersTable.usageReportedAt,
                usage: computersTable.usageSnapshot,
            })
            .from(computersTable)
            .where(eq(computersTable.serverId, serverId))
            .orderBy(desc(computersTable.createdAt)),
        readTokenUsage(db, serverId),
    ]);

    return {
        computers: computers.map((computer) => ({
            ...computer,
            reportedAt: computer.reportedAt?.toISOString() ?? null,
            usage: normalizeStoredUsage(computer.usage),
        })),
        tokenUsage,
    };
}

/**
 * Fills in fields older Computers never stored. Everything a current Computer
 * reports — including each provider's optional `stale` retention stamp — is
 * stored and returned verbatim, so the App reads the Computer's own account of
 * why a snapshot is last-known rather than current.
 */
export function normalizeStoredUsage(usage: UsageOverview | null): UsageOverview | null {
    if (!usage) {
        return null;
    }
    const stored = usage as UsageOverview & {
        grok?: UsageOverview['grok'];
        runtimeUsage?: UsageOverview['runtimeUsage'];
    };
    return {
        ...usage,
        grok: stored.grok ?? {
            error: {
                code: 'unknown',
                message: 'Grok usage has not been reported by this Computer yet.',
                name: 'UsageError',
            },
            provider: 'grok',
            status: 'error',
        },
        runtimeUsage: stored.runtimeUsage ?? [],
    };
}

const tokenFields = [
    'cacheReadTokens',
    'cacheWriteTokens',
    'inputTokens',
    'outputTokens',
    'totalTokens',
] as const;

type TokenTotals = TokenUsageOverview['totals'];

async function readTokenUsage(db: HausDatabase, serverId: string): Promise<TokenUsageOverview> {
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - 89);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowDate = tomorrow.toISOString().slice(0, 10);
    const rows = await db
        .select({
            agentAvatarId: agentsTable.avatarId,
            agentHandle: agentsTable.handle,
            agentId: agentTokenUsageDailyTable.agentId,
            agentName: agentsTable.displayName,
            cacheReadTokens: agentTokenUsageDailyTable.cacheReadTokens,
            cacheWriteTokens: agentTokenUsageDailyTable.cacheWriteTokens,
            date: agentTokenUsageDailyTable.date,
            inputTokens: agentTokenUsageDailyTable.inputTokens,
            modelId: agentTokenUsageDailyTable.modelId,
            outputTokens: agentTokenUsageDailyTable.outputTokens,
            runtimeId: agentTokenUsageDailyTable.runtimeId,
            totalTokens: agentTokenUsageDailyTable.totalTokens,
        })
        .from(agentTokenUsageDailyTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentTokenUsageDailyTable.serverId),
                eq(agentsTable.id, agentTokenUsageDailyTable.agentId)
            )
        )
        .where(
            and(
                eq(agentTokenUsageDailyTable.serverId, serverId),
                gte(agentTokenUsageDailyTable.date, cutoffDate),
                lt(agentTokenUsageDailyTable.date, tomorrowDate)
            )
        );
    const totals = emptyTokenTotals();

    for (const row of rows) {
        addTokens(totals, row);
    }

    return {
        breakdown: rows
            .map(({ agentAvatarId, ...row }) => ({
                ...row,
                agentAvatarUrl: avatarUrlFor(agentAvatarId),
            }))
            .sort((a, b) => a.date.localeCompare(b.date) || b.totalTokens - a.totalTokens),
        days: 90,
        totals,
    };
}

function emptyTokenTotals(): TokenTotals {
    return {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
    };
}

function addTokens(target: TokenTotals, source: TokenTotals) {
    for (const field of tokenFields) {
        target[field] += source[field];
    }
}
