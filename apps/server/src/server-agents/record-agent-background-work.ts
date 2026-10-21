import type { AgentBackgroundWorkReport } from '@haus/api';
import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

/**
 * Stores each Agent's running background sub-agents as its Computer reports them. The
 * `computer_id` guard means a report for an Agent assigned elsewhere updates nothing. Returns
 * the Agents whose count changed, so only they are announced.
 */
export async function recordAgentBackgroundWork(
    db: HausDatabase,
    computerId: string,
    report: AgentBackgroundWorkReport
): Promise<string[]> {
    const changed: string[] = [];
    for (const { agentId, subagents } of report.agents) {
        const updated = await db
            .update(agentsTable)
            .set({ effectiveBackgroundSubagents: subagents })
            .where(
                and(
                    eq(agentsTable.id, agentId),
                    eq(agentsTable.computerId, computerId),
                    ne(agentsTable.effectiveBackgroundSubagents, subagents)
                )
            )
            .returning({ id: agentsTable.id });
        changed.push(...updated.map((row) => row.id));
    }
    return changed;
}
