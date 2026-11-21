import {
    type AgentContextInput,
    type AgentContextReport,
    agentContextSnapshotSchema,
} from '@haus/api';
import { and, eq, lte, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentContextSnapshotsTable, agentsTable } from '../postgres/schema.ts';

export async function recordAgentContext(db: HausDatabase, report: AgentContextReport) {
    const { snapshot } = report;
    const [agent] = await db
        .select({ serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.id, snapshot.agentId),
                eq(agentsTable.sessionGeneration, snapshot.sessionGeneration)
            )
        )
        .limit(1);
    if (!agent) {
        return null;
    }
    const measuredAt = new Date(snapshot.measuredAt);
    const stored = await db
        .insert(agentContextSnapshotsTable)
        .values({
            agentId: snapshot.agentId,
            measuredAt,
            runId: report.runId,
            serverId: agent.serverId,
            sessionGeneration: snapshot.sessionGeneration,
            snapshot,
        })
        .onConflictDoUpdate({
            set: {
                measuredAt,
                reportedAt: sql`now()`,
                runId: report.runId,
                sessionGeneration: snapshot.sessionGeneration,
                snapshot,
            },
            setWhere: lte(agentContextSnapshotsTable.measuredAt, measuredAt),
            target: [agentContextSnapshotsTable.serverId, agentContextSnapshotsTable.agentId],
        })
        .returning({ serverId: agentContextSnapshotsTable.serverId });
    return stored[0]?.serverId ?? null;
}

export async function readAgentContext(db: HausDatabase, input: AgentContextInput) {
    const [row] = await db
        .select({ snapshot: agentContextSnapshotsTable.snapshot })
        .from(agentContextSnapshotsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentContextSnapshotsTable.serverId),
                eq(agentsTable.id, agentContextSnapshotsTable.agentId),
                eq(agentsTable.sessionGeneration, agentContextSnapshotsTable.sessionGeneration)
            )
        )
        .where(
            and(
                eq(agentContextSnapshotsTable.serverId, input.serverId),
                eq(agentContextSnapshotsTable.agentId, input.agentId)
            )
        )
        .limit(1);
    return row ? agentContextSnapshotSchema.parse(row.snapshot) : null;
}
