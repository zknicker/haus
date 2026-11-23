import { computerRemoveRepoFolderInputSchema, repoNameSchema } from '@haus/api';
import { z } from 'zod';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { removeRepoFolder } from '../../repos/manage-repo-folders.ts';
import { repoFolderTrpcError } from '../../repos/repo-errors.ts';
import { memberProcedure } from '../server/procedure.ts';

export const removeComputerRepoFolderProcedure = memberProcedure
    .input(computerRemoveRepoFolderInputSchema)
    .output(z.object({ removed: z.boolean(), repository: repoNameSchema }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            const removed = await removeRepoFolder(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member?.id ?? null,
                input
            );
            if (removed.removed) {
                computerUpdatedTopic.announce({
                    computerId: input.computerId,
                    serverId: input.serverId,
                });
            }
            return removed;
        } catch (cause) {
            throw repoFolderTrpcError(cause);
        }
    });
