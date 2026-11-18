import { githubStartInstallInputSchema, githubStartInstallResultSchema } from '@haus/api';
import { githubInstallStates } from '../../github/install-state.ts';
import { requireGithubAdmin, requireGithubConnection } from '../../github/installation-access.ts';
import { githubProcedure, requireGithubApp } from './procedure.ts';

/**
 * Starts an install on GitHub with single-use Server-held state bound to this
 * Server, connection, and Haus user; `/github/setup` consumes it.
 */
export const startInstall = githubProcedure
    .input(githubStartInstallInputSchema)
    .output(githubStartInstallResultSchema)
    .mutation(async ({ ctx, input }) => {
        const app = requireGithubApp(ctx.githubApp);
        await requireGithubAdmin(ctx.hausDb, ctx.member, input.serverId);
        await requireGithubConnection(ctx.hausDb, input);
        const state = githubInstallStates.create({
            connectionId: input.connectionId,
            serverId: input.serverId,
            // requireGithubAdmin refuses a caller with no Haus user.
            userId: ctx.member?.id ?? '',
        });
        const url = new URL(
            `https://github.com/apps/${encodeURIComponent(app.config.slug)}/installations/new`
        );
        url.searchParams.set('state', state);
        return { url: url.toString() };
    });
