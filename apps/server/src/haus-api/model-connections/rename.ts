import { modelConnectionRenameInputSchema, modelConnectionSchema } from '@haus/api';
import { renameModelConnection } from '../../model-connections/write-model-connections.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const renameModelConnectionProcedure = modelConnectionProcedure
    .input(modelConnectionRenameInputSchema)
    .output(modelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
        const connection = await renameModelConnection(ctx.hausDb, ctx.member, input);
        await ctx.modelConnections.connectionsChanged(input.serverId);
        return connection;
    });
