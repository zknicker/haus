import { modelConnectionAddInputSchema, modelConnectionSchema } from '@haus/api';
import { addModelConnection } from '../../model-connections/write-model-connections.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const addModelConnectionProcedure = modelConnectionProcedure
    .input(modelConnectionAddInputSchema)
    .output(modelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
        const relay = ctx.modelConnections;
        const connection = await addModelConnection(
            ctx.hausDb,
            ctx.member,
            relay.secretsKey,
            input
        );
        await relay.connectionsChanged(input.serverId);
        return connection;
    });
