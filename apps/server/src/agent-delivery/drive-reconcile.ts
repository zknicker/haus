import type { AgentCommand } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable, agentTurnsTable, drivePushesTable } from '../postgres/schema.ts';
import { listComputerAgents } from './dispatch-config.ts';
import { readDeliveryState } from './store.ts';

export async function driveReconcileFrames(db: HausDatabase, machineId: string) {
    const frames: AgentCommand[] = [];
    for (const agent of await listComputerAgents(db, machineId)) {
        if (agent.retiredAt) {
            continue;
        }
        const run = {
            agentId: agent.agentId,
            placementGeneration: agent.placementGeneration,
            sessionGeneration: agent.sessionGeneration,
        };
        const activeRunId = (await readDeliveryState(db, agent.agentId))?.activeRunId;
        if (activeRunId) {
            frames.push({ ...run, runId: activeRunId, type: 'drive-pull' });
            continue;
        }
        const runId = await unclosedLastRunId(db, agent);
        if (runId) {
            frames.push({ ...run, runId, type: 'drive-push' });
        }
    }
    return frames;
}

async function unclosedLastRunId(db: HausDatabase, agent: { agentId: string; serverId: string }) {
    const [turn] = await db
        .select({ closedAt: drivePushesTable.closedAt, runId: agentTurnsTable.runId })
        .from(agentTurnsTable)
        .innerJoin(
            agentRunTriggersTable,
            and(
                eq(agentRunTriggersTable.serverId, agentTurnsTable.serverId),
                eq(agentRunTriggersTable.agentId, agentTurnsTable.agentId),
                eq(agentRunTriggersTable.runId, agentTurnsTable.runId)
            )
        )
        .leftJoin(
            drivePushesTable,
            and(
                eq(drivePushesTable.serverId, agentTurnsTable.serverId),
                eq(drivePushesTable.agentId, agentTurnsTable.agentId),
                eq(drivePushesTable.id, agentTurnsTable.runId)
            )
        )
        .where(
            and(
                eq(agentTurnsTable.serverId, agent.serverId),
                eq(agentTurnsTable.agentId, agent.agentId)
            )
        )
        .orderBy(desc(agentTurnsTable.endedAt))
        .limit(1);
    return turn && turn.closedAt === null ? turn.runId : null;
}
