import { repoListInputSchema, repoListSchema } from '@haus/api';
import { listRepos } from '../../repos/repo-list.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Every repo on the Server's list, where it lives, and whether the Haus GitHub App reaches it. */
export const listReposProcedure = memberProcedure
    .input(repoListInputSchema)
    .output(repoListSchema)
    .query(
        async ({ ctx, input }) =>
            await listRepos(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.githubApp,
                ctx.member,
                input.serverId
            )
    );
