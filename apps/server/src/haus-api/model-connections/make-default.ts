import { modelConnectionListSchema, modelConnectionTargetInputSchema } from '@haus/api';
import { makeDefaultModelConnection } from '../../model-connections/write-model-connections.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const makeDefaultModelConnectionProcedure = modelConnectionProcedure
    .input(modelConnectionTargetInputSchema)
    .output(modelConnectionListSchema)
    .mutation(async ({ ctx, input }) => {
        const list = await makeDefaultModelConnection(ctx.hausDb, ctx.member, input);
        await ctx.modelConnections.connectionsChanged(input.serverId);
        return list;
    });
