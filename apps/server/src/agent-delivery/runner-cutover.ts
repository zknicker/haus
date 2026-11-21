import type { ComputerRuntime } from '@haus/api';
import { and, eq, isNull, lte, notExists, sql } from 'drizzle-orm';
import { markAllComputersOffline } from '../computers/service.ts';
import { resolveModelConnection } from '../model-connections/agent-model-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentSessionRotationsTable, agentsTable, bootStepsTable } from '../postgres/schema.ts';
import { inheritedModel } from '../server-agents/agent-model-catalog.ts';
import { resetInTransaction } from './reset-transaction.ts';

export async function prepareAgentHosts(db: HausDatabase) {
    await markAllComputersOffline(db);
    await db.insert(bootStepsTable).values({ name: cutoverBegan }).onConflictDoNothing();
}

export async function awaitsCutover(db: Pick<HausDatabase, 'execute'>, agentId: string) {
    const rows = await db.execute<{ waiting: boolean }>(sql`
        select not exists (select 1 from boot_steps where name = ${cutoverStep})
           and not exists (
               select 1 from agent_session_rotations
               where agent_id = ${agentId} and reason = 'runner'
           )
           and coalesce(
               (select a.created_at <= b.completed_at
                from agents a, boot_steps b
                where a.id = ${agentId} and b.name = ${cutoverBegan}),
               false
           ) as waiting
    `);
    return rows[0]?.waiting === true;
}

export function cutoverSweep(db: HausDatabase, delivery: { sweep(): Promise<void> }) {
    return { sweep: () => resumeAgentsOnRunner(db, delivery) };
}

export async function resumeAgentsOnRunner(db: HausDatabase, delivery: { sweep(): Promise<void> }) {
    await moveAgentsToRunner(db);
    await delivery.sweep();
}

let cutover: Promise<{ moved: number; stranded: number }> | null = null;

export function moveAgentsToRunner(db: HausDatabase) {
    cutover ??= cutOverWaitingAgents(db).finally(() => {
        cutover = null;
    });
    return cutover;
}

async function cutOverWaitingAgents(db: HausDatabase) {
    const [done] = await db
        .select({ name: bootStepsTable.name })
        .from(bootStepsTable)
        .where(eq(bootStepsTable.name, cutoverStep));
    const [mapped] = await db
        .select({ name: bootStepsTable.name })
        .from(bootStepsTable)
        .where(eq(bootStepsTable.name, catalogMapped));
    if (done || !mapped) {
        return { moved: 0, stranded: 0 };
    }
    await db.insert(bootStepsTable).values({ name: cutoverBegan }).onConflictDoNothing();
    const [began] = await db
        .select({ at: bootStepsTable.completedAt })
        .from(bootStepsTable)
        .where(eq(bootStepsTable.name, cutoverBegan));
    if (!began) {
        throw new Error('The runner cutover could not record when it began.');
    }
    const agents = await db
        .select({
            agentId: agentsTable.id,
            modelId: agentsTable.desiredModelId,
            serverId: agentsTable.serverId,
        })
        .from(agentsTable)
        .where(
            and(
                isNull(agentsTable.retiredAt),
                lte(agentsTable.createdAt, began.at),
                notExists(
                    db
                        .select({ agentId: agentSessionRotationsTable.agentId })
                        .from(agentSessionRotationsTable)
                        .where(
                            and(
                                eq(agentSessionRotationsTable.serverId, agentsTable.serverId),
                                eq(agentSessionRotationsTable.agentId, agentsTable.id),
                                eq(agentSessionRotationsTable.reason, 'runner')
                            )
                        )
                )
            )
        );
    let stranded = 0;
    for (const { modelId, ...agent } of agents) {
        const connection = modelId ? await resolveModelConnection(db, { ...agent, modelId }) : null;
        if (!connection) {
            stranded += 1;
            continue;
        }
        const reset = await resetInTransaction(db, { ...agent, kind: 'session', reason: 'runner' });
        console.info('[haus] moved an Agent to the runner with a fresh session', {
            agentId: agent.agentId,
            sessionGeneration: reset.sessionGeneration,
        });
    }
    if (stranded === 0) {
        await db.insert(bootStepsTable).values({ name: cutoverStep }).onConflictDoNothing();
    }
    return { moved: agents.length - stranded, stranded };
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
    await db.insert(bootStepsTable).values({ name: catalogMapped }).onConflictDoNothing();
}

const cutoverStep = 'agents-move-to-runner';
const cutoverBegan = 'agents-move-to-runner-began';
const catalogMapped = 'agents-mapped-onto-runner-catalog';
