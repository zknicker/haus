import { modelConnectionSchema, modelConnectionSetEnabledInputSchema } from '@haus/api';
import { setModelConnectionEnabled } from '../../model-connections/connection-enabled.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const setModelConnectionEnabledProcedure = modelConnectionProcedure
    .input(modelConnectionSetEnabledInputSchema)
    .output(modelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
        const connection = await setModelConnectionEnabled(ctx.hausDb, ctx.member, input);
        await ctx.modelConnections.connectionsChanged(input.serverId);
        return connection;
    });
