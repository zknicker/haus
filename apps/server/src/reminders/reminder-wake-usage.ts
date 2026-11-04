import type { AgentTokenUsage } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, reminderFiresTable } from '../postgres/schema.ts';

/**
 * Links a settled turn's reported usage back to the reminder fire that woke
 * it, the same way `recordAgentDream` finds the dream a run belongs to:
 * `agent_run_triggers` already records the work (here, a fire id) that
 * dispatched the run, under `source: 'reminder'`. Best-effort: a run merged
 * from several queued items only names the first, so a wake batched behind
 * other work goes unattributed here, same as a dream's usage would.
 */
export async function recordReminderWakeUsage(
    db: HausDatabase,
    run: { agentId: string; runId: string; serverId: string },
    tokenUsage: AgentTokenUsage | null
): Promise<void> {
    if (!tokenUsage) {
        return;
    }
    const [trigger] = await db
        .select({ fireId: agentRunTriggersTable.workId })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, run.serverId),
                eq(agentRunTriggersTable.agentId, run.agentId),
                eq(agentRunTriggersTable.runId, run.runId),
                eq(agentRunTriggersTable.source, 'reminder')
            )
        )
        .limit(1);
    if (!trigger) {
        return;
    }
    await db
        .update(reminderFiresTable)
        .set({ wakeTotalTokens: tokenUsage.totalTokens })
        .where(
            and(
                eq(reminderFiresTable.serverId, run.serverId),
                eq(reminderFiresTable.id, trigger.fireId)
            )
        );
}
