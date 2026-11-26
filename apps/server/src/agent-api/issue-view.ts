import type { Issue, IssueComment, IssueDetail, IssueEvent } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import { nameIssueActors } from '../issues/issue-actor-names.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { issuesTable, taskKeysTable, taskLabelsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

const activityLimit = 20;

export async function toAgentIssueRows(db: Reader, serverId: string, issues: readonly Issue[]) {
    const name = await nameIssueActors(
        db,
        serverId,
        issues.flatMap((issue) => [issue.assignee, issue.creator])
    );
    const labels = await labelNames(db, serverId, issues);
    const parents = await parentCodes(db, serverId, issues);
    return issues.map((issue) => ({
        assignee: issue.assignee ? name(issue.assignee) : null,
        closedSubIssueCount: issue.closedSubIssueCount,
        code: issue.code,
        createdAt: issue.createdAt,
        creator: name(issue.creator),
        dueOn: issue.dueOn,
        labels: issue.labelIds.flatMap((id) => labels.get(id) ?? []),
        parent: issue.parentId ? (parents.get(issue.parentId) ?? null) : null,
        priority: issue.priority,
        state: issue.state.id,
        subIssueCount: issue.subIssueCount,
        taskIds: issue.taskIds,
        title: issue.title,
        updatedAt: issue.updatedAt,
        version: issue.version,
    }));
}

export async function toAgentIssueRow(db: Reader, serverId: string, issue: Issue) {
    const [row] = await toAgentIssueRows(db, serverId, [issue]);
    if (!row) {
        throw new Error(`Issue ${issue.code} did not shape into a row.`);
    }
    return row;
}

export async function toAgentIssueShow(db: Reader, detail: IssueDetail) {
    const { serverId } = detail.issue;
    const activity = detail.events.slice(-activityLimit);
    const name = await nameIssueActors(db, serverId, [
        ...detail.comments.map((comment) => comment.author),
        ...activity.map((event) => event.actor),
    ]);
    return {
        activity: activity.map((event: IssueEvent) => ({
            actor: event.actor ? name(event.actor) : null,
            change: event.change,
            createdAt: event.createdAt,
        })),
        comments: detail.comments.map((comment) => toAgentComment(comment, name)),
        description: detail.issue.description,
        issue: await toAgentIssueRow(db, serverId, detail.issue),
        pullRequests: detail.pullRequests.map(({ number, repository, state }) => ({
            number,
            repository,
            state,
        })),
        subIssues: await toAgentIssueRows(db, serverId, detail.subIssues),
    };
}

export function toAgentComment(
    comment: IssueComment,
    name: Awaited<ReturnType<typeof nameIssueActors>>
) {
    return {
        author: name(comment.author),
        body: comment.body,
        createdAt: comment.createdAt,
        id: comment.id,
        parentCommentId: comment.parentCommentId,
        replyToCommentId: comment.replyToCommentId,
    };
}

async function labelNames(db: Reader, serverId: string, issues: readonly Issue[]) {
    const ids = [...new Set(issues.flatMap((issue) => issue.labelIds))];
    if (ids.length === 0) {
        return new Map<string, string>();
    }
    const rows = await db
        .select({ id: taskLabelsTable.id, name: taskLabelsTable.name })
        .from(taskLabelsTable)
        .where(and(eq(taskLabelsTable.serverId, serverId), inArray(taskLabelsTable.id, ids)));
    return new Map(rows.map((row) => [row.id, row.name]));
}

async function parentCodes(db: Reader, serverId: string, issues: readonly Issue[]) {
    const ids = [...new Set(issues.flatMap((issue) => (issue.parentId ? [issue.parentId] : [])))];
    if (ids.length === 0) {
        return new Map<string, string>();
    }
    const rows = await db
        .select({ id: issuesTable.id, key: taskKeysTable.key, number: issuesTable.number })
        .from(issuesTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, issuesTable.serverId),
                eq(taskKeysTable.id, issuesTable.keyId)
            )
        )
        .where(and(eq(issuesTable.serverId, serverId), inArray(issuesTable.id, ids)));
    return new Map(rows.map((row) => [row.id, `${row.key}-${row.number}`]));
}
