import {
    type IssueActor,
    type IssueNotifiedEvent,
    issueNotificationTitle,
    type PushIssuePayload,
    pushAlertBodyMaxLength,
    sameIssueActor,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { countUnreadInboxRows } from '../chats/unread-chat-count.ts';
import { nameIssueActors } from '../issues/issue-actor-names.ts';
import { readIssue } from '../issues/issue-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    issueCommentsTable,
    issueSubscriptionsTable,
    usersTable,
} from '../postgres/schema.ts';
import { issueNotifiedTopic } from '../realtime/topics.ts';
import { messagePreview } from './message-preview.ts';
import { sendToDevices } from './push-delivery.ts';
import { readPushableMembers } from './push-devices.ts';
import { clampName } from './push-payload.ts';
import type { PushQueue } from './push-queue.ts';
import type { PushSender } from './push-sender.ts';

/**
 * iPhone push for Issues (specs/issues.md#assignee-and-wakes): the post-commit `issue.notified`
 * fact, on the message push's queue and sender, after its read grace. Resolves when `signal`
 * aborts.
 */
export async function listenForIssuePushes(
    db: HausDatabase,
    sender: PushSender,
    queue: PushQueue,
    options: { readGraceMs: number; signal: AbortSignal }
) {
    try {
        for await (const { event } of issueNotifiedTopic.subscribe(options.signal)) {
            const queued = queue.enqueue(
                () =>
                    pushIssueNotification(db, sender, event).catch((error: unknown) => {
                        console.warn(
                            '[haus] iPhone push failed for an Issue',
                            error instanceof Error ? error.name : 'unknown error'
                        );
                    }),
                options.readGraceMs
            );
            if (!queued) {
                console.warn('[haus] iPhone push backlog full; dropped an Issue push');
            }
        }
    } catch (error) {
        if (!options.signal.aborted) {
            console.error(
                '[haus] iPhone push stopped listening for Issues',
                error instanceof Error ? error.message : 'unknown error'
            );
        }
    }
}

/**
 * Pushes one Issue notification, unless it stopped being news during the grace: the Issue
 * went to someone else, or the person unsubscribed before the comment's push.
 */
export async function pushIssueNotification(
    db: HausDatabase,
    sender: PushSender,
    event: IssueNotifiedEvent
) {
    const { issueId, serverId, userId } = event;
    if ((await readPushableMembers(db, serverId, [userId])).length === 0) {
        return;
    }
    const issue = await readIssue(db, serverId, issueId);
    if (!(await stillNews(db, event, issue.assignee))) {
        return;
    }
    const body =
        event.commentId === null ? issue.title : await readCommentBody(db, serverId, event.commentId);
    const payload: PushIssuePayload = {
        aps: {
            alert: {
                body: messagePreview(body, pushAlertBodyMaxLength),
                title: issueNotificationTitle({
                    actorName: await readActorName(db, serverId, event.actor),
                    code: issue.code,
                    kind: event.kind,
                }),
            },
            badge: await countUnreadInboxRows(db, userId),
            sound: 'default',
            'thread-id': issueId,
        },
        code: issue.code,
        issueId,
        kind: event.kind === 'assigned' ? 'issue_assignment' : 'issue_comment',
        serverId,
    };
    await sendToDevices(db, sender, userId, {
        collapseId: event.commentId ?? `issue-assign:${issueId}:${event.version}`,
        payload,
    });
}

async function stillNews(
    db: HausDatabase,
    event: IssueNotifiedEvent,
    assignee: IssueActor | null
) {
    if (event.kind === 'assigned') {
        return sameIssueActor(assignee, { kind: 'user', userId: event.userId });
    }
    const rows = await db
        .select({ userId: issueSubscriptionsTable.userId })
        .from(issueSubscriptionsTable)
        .where(
            and(
                eq(issueSubscriptionsTable.issueId, event.issueId),
                eq(issueSubscriptionsTable.userId, event.userId)
            )
        )
        .limit(1);
    return rows.length > 0;
}

async function readCommentBody(db: HausDatabase, serverId: string, commentId: string) {
    const [comment] = await db
        .select({ body: issueCommentsTable.body })
        .from(issueCommentsTable)
        .where(and(eq(issueCommentsTable.serverId, serverId), eq(issueCommentsTable.id, commentId)))
        .limit(1);
    return comment?.body ?? '';
}

async function readActorName(
    db: HausDatabase,
    serverId: string,
    actor: IssueNotifiedEvent['actor']
) {
    if (actor?.kind === 'user') {
        const [user] = await db
            .select({ name: usersTable.displayName })
            .from(usersTable)
            .where(eq(usersTable.id, actor.userId))
            .limit(1);
        return user?.name ? clampName(user.name) : null;
    }
    if (actor?.kind === 'captain') {
        const [agent] = await db
            .select({ name: agentsTable.displayName })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, actor.agentId)))
            .limit(1);
        return agent?.name ? clampName(agent.name) : null;
    }
    if (actor?.kind === 'task') {
        const name = await nameIssueActors(db, serverId, [actor]);
        const task = name(actor);
        return task.kind === 'task' && task.title ? clampName(task.title) : null;
    }
    return null;
}
