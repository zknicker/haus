import { modelConnectionSchema, modelConnectionSetWebSearchInputSchema } from '@haus/api';
import { setModelConnectionWebSearch } from '../../model-connections/connection-web-search.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const setModelConnectionWebSearchProcedure = modelConnectionProcedure
    .input(modelConnectionSetWebSearchInputSchema)
    .output(modelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
        const connection = await setModelConnectionWebSearch(ctx.hausDb, ctx.member, input);
        await ctx.modelConnections.connectionsChanged(input.serverId);
        return connection;
    });
