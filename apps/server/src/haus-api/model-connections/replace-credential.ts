import { modelConnectionReplaceCredentialInputSchema, modelConnectionSchema } from '@haus/api';
import { replaceModelConnectionCredential } from '../../model-connections/replace-model-connection.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const replaceModelConnectionCredentialProcedure = modelConnectionProcedure
    .input(modelConnectionReplaceCredentialInputSchema)
    .output(modelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
        const relay = ctx.modelConnections;
        const connection = await replaceModelConnectionCredential(
            ctx.hausDb,
            ctx.member,
            relay.secretsKey,
            input
        );
        await relay.connectionsChanged(input.serverId);
        return connection;
    });
