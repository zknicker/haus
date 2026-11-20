import { modelConnectionListInputSchema, modelConnectionsReadSchema } from '@haus/api';
import { readModelConnections } from '../../model-connections/read-model-connections.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const listModelConnectionsProcedure = modelConnectionProcedure
    .input(modelConnectionListInputSchema)
    .output(modelConnectionsReadSchema)
    .query(async ({ ctx, input }) => ({
        ...(await readModelConnections(ctx.hausDb, ctx.member, input.serverId)),
        agentLoop: ctx.modelConnections.agentLoop,
    }));
