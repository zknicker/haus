import {
    type Issue,
    type IssueActor,
    type IssueGetInput,
    type IssueListInput,
    issueEventSchema,
    issuePriorities,
} from '@haus/api';
import { and, asc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    issueEventsTable,
    issuesTable,
    issueTaskLinksTable,
    pullRequestReadingsTable,
    taskPullRequestsTable,
} from '../postgres/schema.ts';
import { actorFromColumns, requireIssueActor } from './issue-actor.ts';
import { listIssueComments } from './issue-comments.ts';
import { findIssueByCode, readIssue, readIssues } from './issue-read.ts';
import { isSubscribed } from './issue-subscriptions.ts';

type Reader = Pick<HausDatabase, 'select'>;

const priorityRank = new Map(issuePriorities.map((priority, rank) => [priority, rank]));

export async function listIssues(db: Reader, actor: IssueActor, input: IssueListInput) {
    await requireIssueActor(db, input.serverId, actor);
    const issues = await readIssues(db, input.serverId, and(...listFilters(input)));
    return [...issues].sort(byPriorityThenAge);
}

export async function getIssue(db: Reader, actor: IssueActor, input: IssueGetInput) {
    await requireIssueActor(db, input.serverId, actor);
    return 'code' in input
        ? await findIssueByCode(db, input.serverId, input.code)
        : await readIssue(db, input.serverId, input.issueId);
}

export async function getIssueDetail(db: Reader, actor: IssueActor, input: IssueGetInput) {
    const issue = await getIssue(db, actor, input);
    const { serverId } = issue;
    return {
        comments: await listIssueComments(db, serverId, issue.id),
        events: await listIssueEvents(db, serverId, issue.id),
        issue,
        pullRequests: await listIssuePullRequests(db, serverId, issue.id),
        subIssues: await readIssues(db, serverId, eq(issuesTable.parentId, issue.id)),
        subscribed: await isSubscribed(db, { actor, issueId: issue.id }),
    };
}

export function byPriorityThenAge(left: Issue, right: Issue) {
    return (
        (priorityRank.get(left.priority) ?? 0) - (priorityRank.get(right.priority) ?? 0) ||
        left.createdAt.localeCompare(right.createdAt)
    );
}

async function listIssueEvents(db: Reader, serverId: string, issueId: string) {
    const rows = await db
        .select()
        .from(issueEventsTable)
        .where(and(eq(issueEventsTable.serverId, serverId), eq(issueEventsTable.issueId, issueId)))
        .orderBy(asc(issueEventsTable.createdAt), asc(issueEventsTable.id));
    return rows.map((row) =>
        issueEventSchema.parse({
            actor: actorFromColumns({
                agentId: row.actorAgentId,
                taskId: row.actorTaskId,
                userId: row.actorUserId,
            }),
            change: row.change,
            createdAt: row.createdAt.toISOString(),
            id: row.id,
        })
    );
}

async function listIssuePullRequests(db: Reader, serverId: string, issueId: string) {
    return await db
        .select({
            number: taskPullRequestsTable.number,
            repository: taskPullRequestsTable.repository,
            state: pullRequestReadingsTable.state,
            taskId: taskPullRequestsTable.taskId,
        })
        .from(issueTaskLinksTable)
        .innerJoin(
            taskPullRequestsTable,
            and(
                eq(taskPullRequestsTable.serverId, issueTaskLinksTable.serverId),
                eq(taskPullRequestsTable.taskId, issueTaskLinksTable.taskId)
            )
        )
        .leftJoin(
            pullRequestReadingsTable,
            and(
                eq(pullRequestReadingsTable.serverId, taskPullRequestsTable.serverId),
                eq(pullRequestReadingsTable.repository, taskPullRequestsTable.repository),
                eq(pullRequestReadingsTable.number, taskPullRequestsTable.number)
            )
        )
        .where(and(eq(issueTaskLinksTable.serverId, serverId), eq(issueTaskLinksTable.issueId, issueId)))
        .orderBy(asc(taskPullRequestsTable.createdAt));
}

function listFilters(input: IssueListInput) {
    const filters: (SQL | undefined)[] = [];
    if (input.projectId) {
        filters.push(eq(issuesTable.projectId, input.projectId));
    }
    if (input.states) {
        filters.push(inArray(issuesTable.state, input.states));
    }
    if (input.parentId) {
        filters.push(eq(issuesTable.parentId, input.parentId));
    }
    if (input.query) {
        const pattern = `%${input.query.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;
        filters.push(or(ilike(issuesTable.title, pattern), ilike(issuesTable.description, pattern)));
    }
    if (input.assignee === 'none') {
        filters.push(
            isNull(issuesTable.assigneeUserId),
            isNull(issuesTable.assigneeAgentId),
            isNull(issuesTable.assigneeTaskId)
        );
    } else if (input.assignee) {
        filters.push(actorIs(input.assignee, 'assignee'));
    }
    if (input.creator) {
        filters.push(actorIs(input.creator, 'creator'));
    }
    return filters;
}

function actorIs(actor: IssueActor, role: 'assignee' | 'creator') {
    const columns =
        role === 'assignee'
            ? {
                  agentId: issuesTable.assigneeAgentId,
                  taskId: issuesTable.assigneeTaskId,
                  userId: issuesTable.assigneeUserId,
              }
            : {
                  agentId: issuesTable.creatorAgentId,
                  taskId: issuesTable.creatorTaskId,
                  userId: issuesTable.creatorUserId,
              };
    switch (actor.kind) {
        case 'user':
            return eq(columns.userId, actor.userId);
        case 'captain':
            return eq(columns.agentId, actor.agentId);
        case 'task':
            return eq(columns.taskId, actor.taskId);
    }
}
