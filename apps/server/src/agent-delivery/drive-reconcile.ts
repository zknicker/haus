import type { AgentCommand } from '@haus/api';
import { desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTurnsTable } from '../postgres/schema.ts';
import { listComputerAgents } from './dispatch-config.ts';
import { readDeliveryState } from './store.ts';

export async function driveReconcileFrames(db: HausDatabase, machineId: string) {
    const frames: AgentCommand[] = [];
    for (const agent of await listComputerAgents(db, machineId)) {
        if (agent.retiredAt) {
            continue;
        }
        const state = await readDeliveryState(db, agent.agentId);
        const runId = state?.activeRunId ?? (await lastRunId(db, agent.agentId));
        if (!runId) {
            continue;
        }
        const run = {
            agentId: agent.agentId,
            placementGeneration: agent.placementGeneration,
            runId,
            sessionGeneration: agent.sessionGeneration,
        };
        frames.push({ ...run, type: 'drive-push' });
        if (state?.activeRunId) {
            frames.push({ ...run, type: 'drive-pull' });
        }
    }
    return frames;
}

async function lastRunId(db: HausDatabase, agentId: string) {
    const [turn] = await db
        .select({ runId: agentTurnsTable.runId })
        .from(agentTurnsTable)
        .where(eq(agentTurnsTable.agentId, agentId))
        .orderBy(desc(agentTurnsTable.endedAt))
        .limit(1);
    return turn?.runId ?? null;
}
