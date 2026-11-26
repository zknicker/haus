import { issueMutationResultSchema, issueUpdateInputSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { updateIssue } from '../../issues/issue-update.ts';
import { commitIssueWrite, issueProcedure } from './procedure.ts';

export const updateIssueProcedure = issueProcedure
    .input(issueUpdateInputSchema)
    .output(issueMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitIssueWrite(ctx, await updateIssue(ctx.hausDb, memberIssueActor(ctx.member), input))
    );
