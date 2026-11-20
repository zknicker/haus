import type { ComputerRuntime } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { markAllComputersOffline } from '../computers/service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, bootStepsTable } from '../postgres/schema.ts';
import { inheritedModel } from '../server-agents/agent-model-catalog.ts';
import { resetInTransaction } from './reset-transaction.ts';

export async function prepareAgentHosts(db: HausDatabase) {
    await markAllComputersOffline(db);
    await moveAgentsToRunner(db);
}

export async function moveAgentsToRunner(db: HausDatabase) {
    const [done] = await db
        .select({ name: bootStepsTable.name })
        .from(bootStepsTable)
        .where(eq(bootStepsTable.name, cutoverStep));
    if (done) {
        return 0;
    }
    const agents = await db
        .select({ agentId: agentsTable.id, serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(isNull(agentsTable.retiredAt));
    for (const agent of agents) {
        const reset = await resetInTransaction(db, { ...agent, kind: 'session', reason: 'runner' });
        console.info('[haus] moved an Agent to the runner with a fresh session', {
            agentId: agent.agentId,
            sessionGeneration: reset.sessionGeneration,
        });
    }
    await db.insert(bootStepsTable).values({ name: cutoverStep }).onConflictDoNothing();
    return agents.length;
}

export async function mapAgentsOntoCatalog(db: HausDatabase, runtimes: readonly ComputerRuntime[]) {
    const catalog = { kind: 'runner' as const, runtimes: () => runtimes };
    const agents = await db
        .select({
            agentId: agentsTable.id,
            modelId: agentsTable.desiredModelId,
            reasoningEffort: agentsTable.desiredReasoningEffort,
            runtimeId: agentsTable.desiredRuntimeId,
            serverId: agentsTable.serverId,
        })
        .from(agentsTable)
        .where(isNull(agentsTable.retiredAt));
    for (const agent of agents) {
        if (!(agent.modelId && agent.runtimeId)) {
            continue;
        }
        const current = {
            modelId: agent.modelId,
            reasoningEffort: agent.reasoningEffort,
            runtimeId: agent.runtimeId,
        };
        const mapped = inheritedModel(catalog, current);
        if (mapped === current) {
            continue;
        }
        await db
            .update(agentsTable)
            .set({
                desiredModelId: mapped.modelId,
                desiredReasoningEffort: mapped.reasoningEffort,
                desiredRuntimeId: mapped.runtimeId,
            })
            .where(
                and(eq(agentsTable.serverId, agent.serverId), eq(agentsTable.id, agent.agentId))
            );
        console.info('[haus] moved an Agent off a model the runner no longer offers', {
            agentId: agent.agentId,
            from: `${current.runtimeId}/${current.modelId}`,
            to: `${mapped.runtimeId}/${mapped.modelId}`,
        });
    }
}

const cutoverStep = 'agents-move-to-runner';
