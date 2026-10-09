import type { AgentEffectiveState } from '@haus/api';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

/**
 * Applies a Computer's per-Agent effective snapshot. The `computer_id` guard
 * means a report for an Agent that is not assigned to the reporting Computer
 * updates no row — cross-Computer effective claims fail closed.
 *
 * A Computer re-sends every snapshot after each turn. Only a snapshot that
 * differs from the stored one (or the first one) is written, so
 * `effectiveReportedAt` marks when the effective state last changed, and the
 * result says whether any Agent's read changed.
 */
export async function recordAgentEffectiveState(
    db: HausDatabase,
    computerId: string,
    states: AgentEffectiveState[]
): Promise<boolean> {
    const reportedAt = new Date();
    let changed = false;

    for (const state of states) {
        const updated = await db
            .update(agentsTable)
            .set({
                effectiveMissing: state.missingResources,
                effectiveModelId: state.modelId,
                effectiveReasoningEffort: state.reasoningEffort,
                effectiveReportedAt: reportedAt,
                effectiveRuntimeId: state.runtimeId,
            })
            .where(
                and(
                    eq(agentsTable.id, state.agentId),
                    eq(agentsTable.computerId, computerId),
                    or(
                        isNull(agentsTable.effectiveReportedAt),
                        sql`${agentsTable.effectiveMissing} is distinct from ${sql.param(state.missingResources)}::jsonb`,
                        sql`${agentsTable.effectiveModelId} is distinct from ${state.modelId}`,
                        sql`${agentsTable.effectiveReasoningEffort} is distinct from ${state.reasoningEffort}`,
                        sql`${agentsTable.effectiveRuntimeId} is distinct from ${state.runtimeId}`
                    )
                )
            )
            .returning({ id: agentsTable.id });
        changed ||= updated.length > 0;
    }
    return changed;
}
