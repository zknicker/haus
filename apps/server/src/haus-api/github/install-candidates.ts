import { githubInstallCandidatesInputSchema, githubInstallCandidatesSchema } from '@haus/api';
import { requireGithubAdmin } from '../../github/installation-access.ts';
import { listGithubInstallCandidates } from '../../github/installation-binding.ts';
import { githubClock, githubProcedure, requireGithubApp } from './procedure.ts';

/** Unbound installations the connection's GitHub user owns ("Add existing installation"). */
export const installCandidates = githubProcedure
    .input(githubInstallCandidatesInputSchema)
    .output(githubInstallCandidatesSchema)
    .query(async ({ ctx, input }) => {
        const app = requireGithubApp(ctx.githubApp);
        await requireGithubAdmin(ctx.hausDb, ctx.member, input.serverId);
        return await listGithubInstallCandidates(
            { app, clock: githubClock, db: ctx.hausDb },
            { ...input, userId: ctx.member?.id ?? '' }
        );
    });
