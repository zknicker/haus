import { issueMutationResultSchema, issueTaskLinkInputSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { unlinkIssueTask } from '../../issues/issue-links.ts';
import { commitIssueWrite, issueProcedure } from './procedure.ts';

export const unlinkIssueTaskProcedure = issueProcedure
    .input(issueTaskLinkInputSchema)
    .output(issueMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitIssueWrite(await unlinkIssueTask(ctx.hausDb, memberIssueActor(ctx.member), input))
    );
