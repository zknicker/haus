import {
    type Issue,
    type IssueActor,
    issueAssignmentNotifiedUserId,
    issueCommentNotifiedUserIds,
    sameIssueActor,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { issueSubscriptionsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { issueNotifiedTopic } from '../realtime/topics.ts';
import { queueIssueWakes, retireIssueAssignments } from './issue-inbox.ts';
import type { IssueWake } from './issue-wakes.ts';
import type { IssueTx } from './issue-write.ts';

/**
 * What every Issue write does after its own rows, in the same transaction: withdraw the
 * Issue's queued assignments when its assignee changed, queue the derived wakes, and prepare
 * the person's assignment notification for push. Returns the events to publish and the
 * agents to dispatch once it commits.
 */
export async function settleIssueWrite(
    tx: IssueTx,
    input: {
        actor: IssueActor | null;
        before: Pick<Issue, 'assignee'> | null;
        events: PreparedRealtimeEvent[];
        issue: Issue;
        wakes: IssueWake[];
    }
) {
    const { actor, before, issue } = input;
    const reassigned = before === null || !sameIssueActor(before.assignee, issue.assignee);
    if (reassigned && before !== null) {
        await retireIssueAssignments(tx, { issueId: issue.id, serverId: issue.serverId });
    }
    const notified = reassigned
        ? issueAssignmentNotifiedUserId({ actor, assignee: issue.assignee })
        : null;
    return {
        agentWakes: await queueIssueWakes(tx, {
            actor,
            serverId: issue.serverId,
            wakes: input.wakes,
        }),
        events: [
            ...input.events,
            ...(notified ? [notification(issue, actor, notified, null)] : []),
        ],
    };
}

/** A comment's wakes, and a push for every subscriber but its author. */
export async function settleIssueComment(
    tx: IssueTx,
    input: { actor: IssueActor; commentId: string; issue: Issue; wakes: IssueWake[] }
) {
    const { actor, issue } = input;
    const subscribers = await tx
        .select({ userId: issueSubscriptionsTable.userId })
        .from(issueSubscriptionsTable)
        .where(
            and(
                eq(issueSubscriptionsTable.serverId, issue.serverId),
                eq(issueSubscriptionsTable.issueId, issue.id)
            )
        );
    const notified = issueCommentNotifiedUserIds({
        author: actor,
        subscriberUserIds: subscribers.map((row) => row.userId),
    });
    return {
        agentWakes: await queueIssueWakes(tx, {
            actor,
            serverId: issue.serverId,
            wakes: input.wakes,
        }),
        events: notified.map((userId) => notification(issue, actor, userId, input.commentId)),
    };
}

function notification(
    issue: Issue,
    actor: IssueActor | null,
    userId: string,
    commentId: string | null
) {
    return issueNotifiedTopic.prepare(
        {
            actor,
            commentId,
            issueId: issue.id,
            kind: commentId ? 'commented' : 'assigned',
            serverId: issue.serverId,
            userId,
            version: issue.version,
        },
        { audienceUserId: userId }
    );
}
