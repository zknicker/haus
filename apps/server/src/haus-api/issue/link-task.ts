import { issueMutationResultSchema, issueTaskLinkInputSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { linkIssueTask } from '../../issues/issue-links.ts';
import { commitIssueWrite, issueProcedure } from './procedure.ts';

export const linkIssueTaskProcedure = issueProcedure
    .input(issueTaskLinkInputSchema)
    .output(issueMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        commitIssueWrite(ctx, await linkIssueTask(ctx.hausDb, memberIssueActor(ctx.member), input))
    );
