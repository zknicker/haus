import {
    formatIssueCode,
    type Issue,
    type IssueChange,
    type IssueComment,
    type IssueDetail,
    type IssueEvent,
} from '@haus/api';
import { issueActorLabel } from '../issues/issue-actor-names.ts';
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
    const labels = await labelNames(db, serverId, issues.flatMap((issue) => issue.labelIds));
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
        ...activity.flatMap((event) => [event.actor, ...assigneesOf(event)]),
    ]);
    const labels = await labelNames(db, serverId, activity.flatMap(labelIdsOf));
    return {
        activity: activity.map((event) => ({
            actor: event.actor ? name(event.actor) : null,
            createdAt: event.createdAt,
            kind: event.change.kind,
            ...changeValues(event.change, name, labels),
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

async function labelNames(db: Reader, serverId: string, labelIds: readonly string[]) {
    const ids = [...new Set(labelIds)];
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
    return new Map(rows.map((row) => [row.id, formatIssueCode(row.key, row.number)]));
}

type ActorNames = Awaited<ReturnType<typeof nameIssueActors>>;

function changeValues(change: IssueChange, name: ActorNames, labels: Map<string, string>) {
    switch (change.kind) {
        case 'created':
        case 'description_edited':
            return { from: null, to: null };
        case 'sub_issue_added':
            return { from: null, to: change.issue };
        case 'sub_issue_removed':
            return { from: change.issue, to: null };
        case 'linked':
            return { from: null, to: `task:${change.taskId}` };
        case 'unlinked':
            return { from: `task:${change.taskId}`, to: null };
        case 'assignee_changed':
            return {
                from: issueActorLabel(change.from && name(change.from)),
                to: issueActorLabel(change.to && name(change.to)),
            };
        case 'labels_changed':
            return { from: labelList(change.from, labels), to: labelList(change.to, labels) };
        default:
            return { from: change.from, to: change.to };
    }
}

function labelList(ids: readonly string[], labels: Map<string, string>) {
    return ids.length === 0 ? 'none' : ids.map((id) => labels.get(id) ?? id).join(', ');
}

function assigneesOf(event: IssueEvent) {
    return event.change.kind === 'assignee_changed' ? [event.change.from, event.change.to] : [];
}

function labelIdsOf(event: IssueEvent) {
    return event.change.kind === 'labels_changed' ? [...event.change.from, ...event.change.to] : [];
}
