import { z } from 'zod';
import { serverUpdatedTopic } from '../../realtime/topics.ts';
import { serverDisplayNameSchema, serverIdSchema } from '../../servers/contracts.ts';
import { renameServer } from '../../servers/rename-server.ts';
import { memberProcedure } from './procedure.ts';

export const renameServerProcedure = memberProcedure
    .input(z.object({ displayName: serverDisplayNameSchema, serverId: serverIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const server = await renameServer(ctx.hausDb, ctx.member, input);

        serverUpdatedTopic.announce({ serverId: server.id });
        return server;
    });
