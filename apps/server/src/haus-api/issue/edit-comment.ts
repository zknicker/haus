import { issueCommentResultSchema, issueEditCommentInputSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { editIssueComment } from '../../issues/issue-comments.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { issueProcedure } from './procedure.ts';

export const editIssueCommentProcedure = issueProcedure
    .input(issueEditCommentInputSchema)
    .output(issueCommentResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await editIssueComment(ctx.hausDb, memberIssueActor(ctx.member), input);
        publishRealtime(result.events);
        return { comment: result.comment };
    });
