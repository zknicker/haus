import { modelConnectionListInputSchema, modelConnectionsReadSchema } from '@haus/api';
import { readModelConnections } from '../../model-connections/read-model-connections.ts';
import type { AgentModelCatalog } from '../../server-agents/agent-model-catalog.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const listModelConnectionsProcedure = modelConnectionProcedure
    .input(modelConnectionListInputSchema)
    .output(modelConnectionsReadSchema)
    .query(async ({ ctx, input }) => ({
        ...(await readModelConnections(ctx.hausDb, ctx.member, input.serverId)),
        runnerModels: runnerModelsOf(ctx.modelConnections.catalog),
    }));

function runnerModelsOf(catalog: AgentModelCatalog) {
    const runtimes = catalog.kind === 'runner' ? catalog.runtimes() : null;
    return runtimes ? [...runtimes] : null;
}
