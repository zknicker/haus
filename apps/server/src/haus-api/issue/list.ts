import { issueListInputSchema, issueListSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { listIssues } from '../../issues/issue-list.ts';
import { issueProcedure } from './procedure.ts';

export const listIssuesProcedure = issueProcedure
    .input(issueListInputSchema)
    .output(issueListSchema)
    .query(async ({ ctx, input }) => listIssues(ctx.hausDb, memberIssueActor(ctx.member), input));
