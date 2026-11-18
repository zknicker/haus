import { z } from 'zod';
import { serverUpdatedTopic } from '../../realtime/topics.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import {
    markServerDeleting,
    purgeDeletedServer,
    readServerDeletion,
    ServerDeleteDeniedError,
} from '../../servers/delete-server.ts';
import { memberProcedure } from './procedure.ts';

/**
 * Deletes a Server. The Owner's confirmation disables it immediately; the
 * PostgreSQL and local-attachment purge is kicked off but never awaited, so the
 * response returns at once and offline machines can never block it. A crash
 * before the purge finishes is recovered on the next boot.
 */
export const deleteServerProcedure = memberProcedure
    .input(z.object({ confirmation: z.string(), serverId: serverIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        const result = await markServerDeleting(ctx.hausDb, ctx.member, input);
        ctx.computerConnections.cleanupServer(result.serverId);
        // Delivered to nobody: every membership is revoked, so each
        // `server.onUpdated` recheck ends with `membership_lost`.
        serverUpdatedTopic.announce({ serverId: result.serverId });
        void ctx.postCommitWork.run('server.delete-purge', () =>
            purgeDeletedServer(ctx.hausDb, ctx.attachmentRoot, result, ctx.artifactStorage)
        );
        return result;
    });

export const serverDeletionStatusProcedure = memberProcedure
    .input(z.object({ deletionId: z.string().regex(/^sdl_[A-Za-z0-9_-]{16}$/u) }).strict())
    .query(async ({ ctx, input }) => {
        if (!ctx.member) {
            throw new ServerDeleteDeniedError('Sign in to read this Server deletion.');
        }
        return await readServerDeletion(ctx.hausDb, ctx.member.id, input.deletionId);
    });
