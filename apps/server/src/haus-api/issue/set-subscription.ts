import { issueSetSubscriptionInputSchema, issueSubscriptionReceiptSchema } from '@haus/api';
import { memberIssueActor } from '../../issues/issue-actor.ts';
import { setIssueSubscription } from '../../issues/issue-subscriptions.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { issueProcedure } from './procedure.ts';

export const setIssueSubscriptionProcedure = issueProcedure
    .input(issueSetSubscriptionInputSchema)
    .output(issueSubscriptionReceiptSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await setIssueSubscription(ctx.hausDb, memberIssueActor(ctx.member), input);
        publishRealtime(result.events);
        return result.receipt;
    });
