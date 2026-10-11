import { githubBindInstallationInputSchema, githubInstallationResultSchema } from '@haus/api';
import { requireGithubAdmin } from '../../github/installation-access.ts';
import { bindGithubInstallation } from '../../github/installation-binding.ts';
import { problemWakes } from '../../github/trigger-problems.ts';
import { githubClock, githubProcedure, requireGithubApp } from './procedure.ts';

/** Binds an existing installation after rerunning the owner check. */
export const bindInstallation = githubProcedure
    .input(githubBindInstallationInputSchema)
    .output(githubInstallationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const app = requireGithubApp(ctx.githubApp);
        await requireGithubAdmin(ctx.hausDb, ctx.member, input.serverId);
        const bound = await bindGithubInstallation(
            { app, clock: githubClock, db: ctx.hausDb },
            { ...input, userId: ctx.member?.id ?? '' }
        );
        if (bound.entered.length > 0) {
            void ctx.postCommitWork.wakeAgents(
                ctx.agentDelivery,
                problemWakes(input.serverId, bound.entered)
            );
        }
        return { installation: bound.installation };
    });
