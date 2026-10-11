import { githubRepositoriesInputSchema, githubRepositoriesSchema } from '@haus/api';
import { requireLiveGithubInstallation } from '../../github/installation-access.ts';
import { readGithubPickerRepositories } from '../../github/repository-access.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { githubClock, githubProcedure, requireGithubApp } from './procedure.ts';

/** The repository picker: what the connection's GitHub user can access in the installation. */
export const repositories = githubProcedure
    .input(githubRepositoriesInputSchema)
    .output(githubRepositoriesSchema)
    .query(async ({ ctx, input }) => {
        const app = requireGithubApp(ctx.githubApp);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const installation = await requireLiveGithubInstallation(ctx.hausDb, input);
        return await readGithubPickerRepositories(
            { clock: githubClock, db: ctx.hausDb, transport: app.transport },
            installation,
            input.query
        );
    });
