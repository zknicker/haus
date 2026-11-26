import { issueCommentInputSchema, issueCommentResultSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { addIssueComment } from '../../issues/issue-comments.ts';
import { commitIssueWrite, issueProcedure } from './procedure.ts';

export const commentIssueProcedure = issueProcedure
    .input(issueCommentInputSchema)
    .output(issueCommentResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await addIssueComment(ctx.hausDb, memberIssueActor(ctx.member), input);
        commitIssueWrite(ctx, result);
        return { comment: result.comment };
    });
