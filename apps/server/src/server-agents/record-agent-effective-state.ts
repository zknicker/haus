import type { AgentReasoningEffort } from '@haus/api';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

/**
 * Records the execution configuration a run was frozen onto as the Agent's
 * effective state. Every Agent runs on the runner, which launches each run on
 * exactly the configuration the Server dispatched it with, so a dispatched run
 * is the moment a desired configuration takes effect. A configure while a run
 * is active stays pending until the next run dispatches on it.
 *
 * Only a change is written, so `effectiveReportedAt` marks when the effective
 * state last changed, and the result says whether it changed. Runner Agents
 * report no missing local resources.
 */
export async function recordRunEffectiveState(
    db: HausDatabase,
    run: {
        agentId: string;
        modelId: string;
        reasoningEffort: AgentReasoningEffort;
        runtimeId: string;
    }
) {
    const changed = await db
        .update(agentsTable)
        .set({
            effectiveMissing: [],
            effectiveModelId: run.modelId,
            effectiveReasoningEffort: run.reasoningEffort,
            effectiveReportedAt: new Date(),
            effectiveRuntimeId: run.runtimeId,
        })
        .where(
            and(
                eq(agentsTable.id, run.agentId),
                or(
                    isNull(agentsTable.effectiveReportedAt),
                    sql`${agentsTable.effectiveMissing} is distinct from '[]'::jsonb`,
                    sql`${agentsTable.effectiveModelId} is distinct from ${run.modelId}`,
                    sql`${agentsTable.effectiveReasoningEffort} is distinct from ${run.reasoningEffort}`,
                    sql`${agentsTable.effectiveRuntimeId} is distinct from ${run.runtimeId}`
                )
            )
        )
        .returning({ id: agentsTable.id });
    return changed.length > 0;
}
