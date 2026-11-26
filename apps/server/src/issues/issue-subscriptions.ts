import type { IssueActor, IssueSetSubscriptionInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { issueSubscriptionsTable } from '../postgres/schema.ts';
import { issueSubscriptionUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireIssueActor } from './issue-actor.ts';
import { subscribeToIssue } from './issue-fields.ts';
import { readIssue } from './issue-read.ts';

export async function setIssueSubscription(
    db: HausDatabase,
    actor: Extract<IssueActor, { kind: 'user' }>,
    input: IssueSetSubscriptionInput
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const issue = await readIssue(tx, serverId, input.issueId);
        if (input.subscribed) {
            await subscribeToIssue(tx, { issueId: issue.id, serverId, userId: actor.userId });
        } else {
            await tx
                .delete(issueSubscriptionsTable)
                .where(
                    and(
                        eq(issueSubscriptionsTable.issueId, issue.id),
                        eq(issueSubscriptionsTable.userId, actor.userId)
                    )
                );
        }
        const receipt = { issueId: issue.id, serverId, subscribed: input.subscribed };
        return {
            events: [issueSubscriptionUpdatedTopic.prepare(receipt, { audienceUserId: actor.userId })],
            receipt,
        };
    });
}

export async function isSubscribed(
    db: Pick<HausDatabase, 'select'>,
    input: { actor: IssueActor; issueId: string }
) {
    if (input.actor.kind !== 'user') {
        return false;
    }
    const rows = await db
        .select({ userId: issueSubscriptionsTable.userId })
        .from(issueSubscriptionsTable)
        .where(
            and(
                eq(issueSubscriptionsTable.issueId, input.issueId),
                eq(issueSubscriptionsTable.userId, input.actor.userId)
            )
        )
        .limit(1);
    return rows.length > 0;
}
