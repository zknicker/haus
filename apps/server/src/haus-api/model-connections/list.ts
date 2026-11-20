import { modelConnectionListInputSchema, modelConnectionListSchema } from '@haus/api';
import { readModelConnections } from '../../model-connections/read-model-connections.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const listModelConnectionsProcedure = modelConnectionProcedure
    .input(modelConnectionListInputSchema)
    .output(modelConnectionListSchema)
    .query(({ ctx, input }) => readModelConnections(ctx.hausDb, ctx.member, input.serverId));
