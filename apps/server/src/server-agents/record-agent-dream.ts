import { type AgentDreamRecord, dreamRetentionPerAgent } from '@haus/api';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDreamSummariesTable,
    agentDreamsTable,
    agentRunTriggersTable,
    agentsTable,
} from '../postgres/schema.ts';

/**
 * Persists what a dream changed in the Agent's memory, then keeps only the newest
 * {@link dreamRetentionPerAgent} for that Agent. Fails closed: a record from a
 * Computer the Agent is not assigned to, or for a run the Server did not start
 * as a dream, writes nothing. A retried record replaces its own row.
 */
export async function recordAgentDream(
    db: HausDatabase,
    computerId: string,
    record: AgentDreamRecord
): Promise<boolean> {
    const [run] = await db
        .select({ serverId: agentsTable.serverId })
        .from(agentsTable)
        .innerJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentsTable.serverId),
                eq(agentRunTriggersTable.agentId, agentsTable.id),
                eq(agentRunTriggersTable.runId, record.runId),
                eq(agentRunTriggersTable.source, 'dream')
            )
        )
        .where(and(eq(agentsTable.id, record.agentId), eq(agentsTable.computerId, computerId)))
        .limit(1);
    if (!run) {
        return false;
    }
    const row = {
        files: record.files,
        finishedAt: new Date(record.finishedAt),
        patch: record.patch,
        startedAt: new Date(record.startedAt),
        truncated: record.truncated,
    };
    await db.transaction(async (tx) => {
        await tx
            .insert(agentDreamsTable)
            .values({
                ...row,
                agentId: record.agentId,
                runId: record.runId,
                serverId: run.serverId,
            })
            .onConflictDoUpdate({ set: row, target: agentDreamsTable.runId });
        const scope = and(
            eq(agentDreamsTable.serverId, run.serverId),
            eq(agentDreamsTable.agentId, record.agentId)
        );
        const kept = tx
            .select({ runId: agentDreamsTable.runId })
            .from(agentDreamsTable)
            .where(scope)
            .orderBy(desc(agentDreamsTable.startedAt), desc(agentDreamsTable.runId))
            .limit(dreamRetentionPerAgent);
        const pruned = await tx
            .delete(agentDreamsTable)
            .where(and(scope, notInArray(agentDreamsTable.runId, kept)))
            .returning({ runId: agentDreamsTable.runId });
        if (pruned.length > 0) {
            // A pruned dream's "learned" text goes with it.
            await tx.delete(agentDreamSummariesTable).where(
                inArray(
                    agentDreamSummariesTable.runId,
                    pruned.map((dream) => dream.runId)
                )
            );
        }
    });
    return true;
}
