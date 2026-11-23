import { repoListInputSchema, repoListSchema } from '@haus/api';
import { listRepos } from '../../repos/repo-list.ts';
import { memberProcedure } from '../server/procedure.ts';

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
