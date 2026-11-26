import { createRouter } from '../trpc.ts';
import { commentIssueProcedure } from './comment.ts';
import { createIssueProcedure } from './create.ts';
import { editIssueCommentProcedure } from './edit-comment.ts';
import { getIssueProcedure } from './get.ts';
import { linkIssueTaskProcedure } from './link-task.ts';
import { listIssuesProcedure } from './list.ts';
import { onIssueCommentedProcedure } from './on-commented.ts';
import { onIssueCreatedProcedure } from './on-created.ts';
import { onIssueSubscriptionUpdatedProcedure } from './on-subscription-updated.ts';
import { onIssueUpdatedProcedure } from './on-updated.ts';
import { setIssueSubscriptionProcedure } from './set-subscription.ts';
import { unlinkIssueTaskProcedure } from './unlink-task.ts';
import { updateIssueProcedure } from './update.ts';

export const issueRouter = createRouter({
    comment: commentIssueProcedure,
    create: createIssueProcedure,
    editComment: editIssueCommentProcedure,
    get: getIssueProcedure,
    linkTask: linkIssueTaskProcedure,
    list: listIssuesProcedure,
    onCommented: onIssueCommentedProcedure,
    onCreated: onIssueCreatedProcedure,
    onSubscriptionUpdated: onIssueSubscriptionUpdatedProcedure,
    onUpdated: onIssueUpdatedProcedure,
    setSubscription: setIssueSubscriptionProcedure,
    unlinkTask: unlinkIssueTaskProcedure,
    update: updateIssueProcedure,
});
