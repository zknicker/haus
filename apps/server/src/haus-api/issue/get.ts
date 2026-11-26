import { issueDetailSchema, issueGetInputSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { getIssueDetail } from '../../issues/issue-list.ts';
import { issueProcedure } from './procedure.ts';

export const getIssueProcedure = issueProcedure
    .input(issueGetInputSchema)
    .output(issueDetailSchema)
    .query(async ({ ctx, input }) =>
        getIssueDetail(ctx.hausDb, memberIssueActor(ctx.member), input)
    );
