import { githubInstallationsInputSchema, githubInstallationsSchema } from '@haus/api';
import {
    listGithubInstallations,
    requireGithubConnection,
} from '../../github/installation-access.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { githubProcedure } from './procedure.ts';

/** The connection's bound installations; any Server member may read them. */
export const installations = githubProcedure
    .input(githubInstallationsInputSchema)
    .output(githubInstallationsSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        await requireGithubConnection(ctx.hausDb, input);
        return await listGithubInstallations(ctx.hausDb, input);
    });
