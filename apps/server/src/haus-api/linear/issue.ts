import { linearIssueInputSchema, linearIssueResultSchema } from '@haus/api';
import { env } from '../../config/env.ts';
import { chipWorkspaceToken } from '../../linear/issue-chip-tokens.ts';
import { readLinearIssueReference } from '../../linear/issue-reference.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';

/** `linear.issue`: one issue chip for any member of the Server. */
export const linearIssue = memberProcedure
    .input(linearIssueInputSchema)
    .output(linearIssueResultSchema)
    .query(async ({ ctx, input }) => {
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        return await readLinearIssueReference(
            ctx.hausDb,
            {
                accessToken: (workspaceId) => chipWorkspaceToken(ctx.hausDb, workspaceId),
                appOrigin: env.HAUS_APP_ORIGIN,
                signingKey: env.HAUS_LINEAR_URL_SIGNING_KEY ?? null,
                transport: fetch,
            },
            input
        );
    });
