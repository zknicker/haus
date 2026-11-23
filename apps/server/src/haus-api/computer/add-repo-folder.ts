import { computerAddRepoFolderInputSchema, repoFolderPathSchema, repoNameSchema } from '@haus/api';
import { z } from 'zod';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { addRepoFolderFromApp } from '../../repos/manage-repo-folders.ts';
import { repoFolderTrpcError } from '../../repos/repo-errors.ts';
import { memberProcedure } from '../server/procedure.ts';

export const addComputerRepoFolderProcedure = memberProcedure
    .input(computerAddRepoFolderInputSchema)
    .output(
        z
            .object({ added: z.boolean(), path: repoFolderPathSchema, repository: repoNameSchema })
            .strict()
    )
    .mutation(async ({ ctx, input }) => {
        try {
            const added = await addRepoFolderFromApp(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member?.id ?? null,
                input
            );
            if (added.added) {
                computerUpdatedTopic.announce({
                    computerId: input.computerId,
                    serverId: input.serverId,
                });
            }
            return added;
        } catch (cause) {
            throw repoFolderTrpcError(cause);
        }
    });
