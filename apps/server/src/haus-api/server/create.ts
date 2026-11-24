import { z } from 'zod';
import { serverDisplayNameSchema, serverSlugSchema } from '../../servers/contracts.ts';
import { createServer } from '../../servers/create-server.ts';
import { serverProcedure } from './procedure.ts';

export const createServerProcedure = serverProcedure
    .input(z.object({ displayName: serverDisplayNameSchema, slug: serverSlugSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const server = await createServer(ctx.hausDb, {
            userId: ctx.userId!,
            displayName: input.displayName,
            slug: input.slug,
        });
        await ctx.managedSkills.seedServer(
            { serverId: server.id, userId: server.viewerUserId },
            ctx.postCommitWork
        );
        return server;
    });
