import { issueCommentInputSchema, issueCommentResultSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { addIssueComment } from '../../issues/issue-comments.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { issueProcedure } from './procedure.ts';

export const commentIssueProcedure = issueProcedure
    .input(issueCommentInputSchema)
    .output(issueCommentResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await addIssueComment(ctx.hausDb, memberIssueActor(ctx.member), input);
        publishRealtime(result.events);
        return { comment: result.comment };
    });
