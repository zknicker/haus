import { computerAddRepoFolderInputSchema, computerAddRepoFolderResultSchema } from '@haus/api';
import { computerUpdatedTopic } from '../../realtime/topics.ts';
import { addRepoFolderFromApp } from '../../repos/manage-repo-folders.ts';
import { repoFolderTrpcError } from '../../repos/repo-errors.ts';
import { readRepoGithubAccess } from '../../repos/repo-github-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Adds the folder, then answers whether the Haus GitHub App reaches the repo it names. */
export const addComputerRepoFolderProcedure = memberProcedure
    .input(computerAddRepoFolderInputSchema)
    .output(computerAddRepoFolderResultSchema)
    .mutation(async ({ ctx, input }) => {
        let added: Awaited<ReturnType<typeof addRepoFolderFromApp>>;
        try {
            added = await addRepoFolderFromApp(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member?.id ?? null,
                input
            );
        } catch (cause) {
            throw repoFolderTrpcError(cause);
        }
        if (added.added) {
            computerUpdatedTopic.announce({
                computerId: input.computerId,
                serverId: input.serverId,
            });
        }
        const github = await readRepoGithubAccess(ctx.hausDb, ctx.githubApp, input.serverId);
        return { ...added, githubAccess: await github.accessOf(added.repository) };
    });
