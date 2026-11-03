import type { AgentBackgroundWorkReport } from '@haus/api';
import { and, eq, ne, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

/** An Agent whose stored background work changed, and whether any is still live. */
export interface AgentBackgroundWorkChange {
    agentId: string;
    idle: boolean;
}

/**
 * Stores each Agent's running background sub-agents and tasks as its Computer reports them.
 * A report without `tasks` (an older Computer) counts its sub-agents as its tasks. The
 * `computer_id` guard means a report for an Agent assigned elsewhere updates nothing. Returns
 * the Agents whose counts changed, so only they are announced, and so an Agent whose work
 * ended can lead the heartbeat or dream that waited for it.
 */
export async function recordAgentBackgroundWork(
    db: HausDatabase,
    computerId: string,
    report: AgentBackgroundWorkReport
): Promise<AgentBackgroundWorkChange[]> {
    const changed: AgentBackgroundWorkChange[] = [];
    for (const { agentId, subagents, tasks: reportedTasks } of report.agents) {
        const tasks = Math.max(reportedTasks ?? subagents, subagents);
        const updated = await db
            .update(agentsTable)
            .set({ effectiveBackgroundSubagents: subagents, effectiveBackgroundTasks: tasks })
            .where(
                and(
                    eq(agentsTable.id, agentId),
                    eq(agentsTable.computerId, computerId),
                    or(
                        ne(agentsTable.effectiveBackgroundSubagents, subagents),
                        ne(agentsTable.effectiveBackgroundTasks, tasks)
                    )
                )
            )
            .returning({ id: agentsTable.id });
        changed.push(...updated.map((row) => ({ agentId: row.id, idle: tasks === 0 })));
    }
    return changed;
}
