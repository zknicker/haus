import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, agentsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readRunPlacement(
    db: Reader,
    input: { agentId: string; runId: string; serverId: string }
) {
    const [run] = await db
        .select({ placementGeneration: agentRunTriggersTable.placementGeneration })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, input.serverId),
                eq(agentRunTriggersTable.agentId, input.agentId),
                eq(agentRunTriggersTable.runId, input.runId)
            )
        )
        .limit(1);
    return run?.placementGeneration ?? null;
}

export async function placementUnchanged(
    db: Reader,
    input: { agentId: string; placementGeneration: number; serverId: string }
) {
    const [agent] = await db
        .select({ placementGeneration: agentsTable.placementGeneration })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    return agent?.placementGeneration === input.placementGeneration;
}
