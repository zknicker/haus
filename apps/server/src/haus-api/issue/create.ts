import { issueCreateInputSchema, issueMutationResultSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { createIssue } from '../../issues/issue-create.ts';
import { commitIssueWrite, issueProcedure } from './procedure.ts';

export const createIssueProcedure = issueProcedure
    .input(issueCreateInputSchema)
    .output(issueMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitIssueWrite(await createIssue(ctx.hausDb, memberIssueActor(ctx.member), input))
    );
