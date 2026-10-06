import type { AgentTurnSummary } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentRunTriggersTable, agentsTable, agentTurnsTable } from '../postgres/schema.ts';

/**
 * Persists a Computer's compact turn summary. The `computer_id` guard means a
 * summary for an Agent not assigned to the reporting Computer writes nothing —
 * cross-Computer activity claims fail closed. The upsert is keyed by run so a
 * retried report never duplicates a turn row.
 */
export async function recordAgentTurnSummary(
    db: HausDatabase,
    computerId: string,
    summary: AgentTurnSummary
): Promise<void> {
    const [agent] = await db
        .select({ serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, summary.agentId), eq(agentsTable.computerId, computerId)))
        .limit(1);
    if (!agent) {
        return;
    }

    await db
        .insert(agentTurnsTable)
        .values({
            activity: summary.activity,
            agentId: summary.agentId,
            computerId,
            endedAt: new Date(summary.endedAt),
            failureKind: summary.failureKind ?? null,
            id: createOpaqueId('atn'),
            messageCount: summary.messageCount,
            modelId: summary.modelId,
            outputProduced: summary.outputProduced,
            runId: summary.runId,
            runtimeId: summary.runtimeId,
            serverId: agent.serverId,
            startedAt: new Date(summary.startedAt),
            status: summary.status,
            summary: summary.summary,
            cacheReadTokens: summary.tokenUsage?.cacheReadTokens ?? 0,
            cacheWriteTokens: summary.tokenUsage?.cacheWriteTokens ?? 0,
            inputTokens: summary.tokenUsage?.inputTokens ?? 0,
            outputTokens: summary.tokenUsage?.outputTokens ?? 0,
            tokenUsageReported: summary.tokenUsage !== null,
            totalTokens: summary.tokenUsage?.totalTokens ?? 0,
        })
        .onConflictDoUpdate({
            set: {
                activity: summary.activity,
                endedAt: new Date(summary.endedAt),
                failureKind: summary.failureKind ?? null,
                messageCount: summary.messageCount,
                modelId: summary.modelId,
                outputProduced: summary.outputProduced,
                reportedAt: new Date(),
                runtimeId: summary.runtimeId,
                status: summary.status,
                summary: summary.summary,
                cacheReadTokens: summary.tokenUsage?.cacheReadTokens ?? 0,
                cacheWriteTokens: summary.tokenUsage?.cacheWriteTokens ?? 0,
                inputTokens: summary.tokenUsage?.inputTokens ?? 0,
                outputTokens: summary.tokenUsage?.outputTokens ?? 0,
                tokenUsageReported: summary.tokenUsage !== null,
                totalTokens: summary.tokenUsage?.totalTokens ?? 0,
            },
            target: [agentTurnsTable.serverId, agentTurnsTable.agentId, agentTurnsTable.runId],
        });
}

/**
 * Records the inbox work that woke a new run, once at dispatch, so its settled
 * turn can name what started it after the inbox row is requeued or retired.
 */
export async function recordRunTrigger(
    db: HausDatabase,
    run: { agentId: string; runId: string; serverId: string },
    first: { chatId: string; dedupeKey: string; source: string }
): Promise<void> {
    await db
        .insert(agentRunTriggersTable)
        .values({ ...run, chatId: first.chatId, source: first.source, workId: first.dedupeKey })
        .onConflictDoNothing();
}
