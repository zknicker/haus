import { type AgentActivityEntry, agentTurnActivitySummarySchema } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTurnsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function listAgentActivity(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; limit: number; serverId: string }
): Promise<AgentActivityEntry[]> {
    await requireServerMembership(db, member, input.serverId);
    const rows = await db
        .select({
            activity: agentTurnsTable.activity,
            endedAt: agentTurnsTable.endedAt,
            messageCount: agentTurnsTable.messageCount,
            runId: agentTurnsTable.runId,
            startedAt: agentTurnsTable.startedAt,
            status: agentTurnsTable.status,
            summary: agentTurnsTable.summary,
        })
        .from(agentTurnsTable)
        .where(
            and(
                eq(agentTurnsTable.serverId, input.serverId),
                eq(agentTurnsTable.agentId, input.agentId)
            )
        )
        .orderBy(desc(agentTurnsTable.endedAt))
        .limit(input.limit);

    return rows.map((row) => ({
        ...row,
        activity: agentTurnActivitySummarySchema.parse(row.activity),
        endedAt: row.endedAt.toISOString(),
        startedAt: row.startedAt.toISOString(),
    }));
}
