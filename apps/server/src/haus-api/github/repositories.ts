import { githubRepositoriesInputSchema, githubRepositoriesSchema } from '@haus/api';
import {
    requireGithubAdmin,
    requireLiveGithubInstallation,
} from '../../github/installation-access.ts';
import { readGithubPickerRepositories } from '../../github/repository-access.ts';
import { githubClock, githubProcedure, requireGithubApp } from './procedure.ts';

/**
 * The repository picker: what the connection's GitHub user can access in the
 * installation. It names private repositories, so like Trigger authoring it is
 * Owner or Admin only; Agents read through their own granted route.
 */
export const repositories = githubProcedure
    .input(githubRepositoriesInputSchema)
    .output(githubRepositoriesSchema)
    .query(async ({ ctx, input }) => {
        const app = requireGithubApp(ctx.githubApp);
        await requireGithubAdmin(ctx.hausDb, ctx.member, input.serverId);
        const installation = await requireLiveGithubInstallation(ctx.hausDb, input);
        return await readGithubPickerRepositories(
            { clock: githubClock, db: ctx.hausDb, transport: app.transport },
            installation,
            input.query
        );
    });
