import type { WorkerRuntime } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { type ComputerPlace, computerPlaceLabel } from './computer-places.ts';
import { WorkerModelUnavailableError } from './place-errors.ts';

const runtimeAliases: Readonly<Record<WorkerRuntime, readonly string[]>> = {
    'claude-code': ['haiku', 'opus', 'sonnet'],
    codex: [],
};

export async function chooseWorkerModel(
    db: Pick<HausDatabase, 'select'>,
    input: {
        agentId: string;
        place: ComputerPlace;
        requested: string | null;
        runtime: WorkerRuntime;
        serverId: string;
    }
) {
    const models = input.place.models[input.runtime];
    const refuse = (requested: string | null) =>
        new WorkerModelUnavailableError({
            models,
            name: computerPlaceLabel(input.place),
            requested,
            runtime: input.runtime,
        });
    if (input.requested) {
        const runnable = [...models, ...runtimeAliases[input.runtime]];
        if (models.length > 0 && !runnable.includes(input.requested)) {
            throw refuse(input.requested);
        }
        return input.requested;
    }
    const [agent] = await db
        .select({ model: agentsTable.effectiveModelId, runtime: agentsTable.effectiveRuntimeId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (agent?.runtime === input.runtime && agent.model && models.includes(agent.model)) {
        return agent.model;
    }
    const [first] = models;
    if (!first) {
        throw refuse(null);
    }
    return first;
}
