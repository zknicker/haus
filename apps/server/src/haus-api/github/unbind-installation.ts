import { githubUnbindInstallationInputSchema } from '@haus/api';
import { unbindGithubInstallation } from '../../github/installation-removal.ts';
import { problemWakes } from '../../github/trigger-problems.ts';
import { githubClock, githubProcedure } from './procedure.ts';

/**
 * Removes an installation from Haus: dependent Triggers enter
 * `installation_removed` with one notice each and the row becomes a tombstone.
 * The installation stays on GitHub.
 */
export const unbindInstallation = githubProcedure
    .input(githubUnbindInstallationInputSchema)
    .mutation(async ({ ctx, input }) => {
        const entered = await unbindGithubInstallation(ctx.hausDb, ctx.member, {
            ...input,
            now: githubClock.now(),
        });
        if (entered.length > 0) {
            void ctx.postCommitWork.wakeAgents(
                ctx.agentDelivery,
                problemWakes(input.serverId, entered)
            );
        }
    });
