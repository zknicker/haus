import type { HausAgentAppliedState } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export async function clearHausAgentState(db: HausDatabase, computerId: string): Promise<void> {
    await db
        .update(agentsTable)
        .set({
            effectiveHausAgentAppliedAt: null,
            effectiveHausAgentStatus: null,
            effectiveHausAgentVersion: null,
        })
        .where(eq(agentsTable.computerId, computerId));
}

/**
 * Applies one Computer's complete Haus Agent version snapshot to its assigned
 * Agents: an Agent the snapshot omits reads pending. Only rows whose receipt
 * differs are written, and the result says whether any Agent's read changed, so
 * a snapshot re-sent after every turn wakes no App.
 */
export async function recordHausAgentState(
    db: HausDatabase,
    computerId: string,
    states: HausAgentAppliedState[]
): Promise<boolean> {
    const reported = new Map(states.map((state) => [state.agentId, state]));
    return await db.transaction(async (tx) => {
        const assigned = await tx
            .select({
                appliedAt: agentsTable.effectiveHausAgentAppliedAt,
                id: agentsTable.id,
                status: agentsTable.effectiveHausAgentStatus,
                version: agentsTable.effectiveHausAgentVersion,
            })
            .from(agentsTable)
            .where(eq(agentsTable.computerId, computerId))
            .for('update');
        let changed = false;
        for (const agent of assigned) {
            const state = reported.get(agent.id);
            const next = {
                effectiveHausAgentAppliedAt: state?.appliedAt ? new Date(state.appliedAt) : null,
                effectiveHausAgentStatus: state?.status ?? null,
                effectiveHausAgentVersion: state?.version ?? null,
            };
            if (
                (agent.appliedAt?.getTime() ?? null) ===
                    (next.effectiveHausAgentAppliedAt?.getTime() ?? null) &&
                agent.status === next.effectiveHausAgentStatus &&
                agent.version === next.effectiveHausAgentVersion
            ) {
                continue;
            }
            await tx
                .update(agentsTable)
                .set(next)
                .where(and(eq(agentsTable.id, agent.id), eq(agentsTable.computerId, computerId)));
            changed = true;
        }
        return changed;
    });
}
