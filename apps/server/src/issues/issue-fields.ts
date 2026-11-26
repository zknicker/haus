import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    issueLabelAssignmentsTable,
    issueSubscriptionsTable,
    projectsTable,
    taskLabelsTable,
} from '../postgres/schema.ts';
import {
    IssueInvariantError,
    IssueParentCycleError,
    IssueParentProjectError,
} from './issue-errors.ts';
import { readIssue } from './issue-read.ts';

type Reader = Pick<HausDatabase, 'select'>;
type Writer = Pick<HausDatabase, 'delete' | 'insert' | 'select'>;

export async function requireIssueProject(db: Reader, serverId: string, projectId: string) {
    const [project] = await db
        .select({ keyId: projectsTable.taskKeyId })
        .from(projectsTable)
        .where(and(eq(projectsTable.serverId, serverId), eq(projectsTable.chatId, projectId)))
        .limit(1);
    if (!project) {
        throw new IssueInvariantError('An Issue belongs to a Project of this Server.');
    }
    return project;
}

export async function requireIssueParent(
    db: Pick<HausDatabase, 'execute' | 'select'>,
    input: { code: string | null; issueId: string | null; parentId: string; projectId: string; serverId: string }
) {
    const parent = await readIssue(db, input.serverId, input.parentId);
    if (parent.projectId !== input.projectId) {
        throw new IssueParentProjectError();
    }
    if (input.issueId === null) {
        return parent;
    }
    const rows = await db.execute<{ id: string }>(sql`
        with recursive ancestors(id, parent_id) as (
            select id, parent_id from issues
            where server_id = ${input.serverId} and id = ${input.parentId}
            union
            select issue.id, issue.parent_id from issues issue
            join ancestors on issue.id = ancestors.parent_id
            where issue.server_id = ${input.serverId}
        )
        select id from ancestors where id = ${input.issueId}
    `);
    if (rows.length > 0) {
        throw new IssueParentCycleError(input.code ?? 'this Issue', parent.code);
    }
    return parent;
}

export async function writeIssueLabels(
    tx: Writer,
    input: { issueId: string; labelIds: readonly string[]; serverId: string }
) {
    const labelIds = [...new Set(input.labelIds)];
    if (labelIds.length > 0) {
        const found = await tx
            .select({ id: taskLabelsTable.id })
            .from(taskLabelsTable)
            .where(
                and(
                    eq(taskLabelsTable.serverId, input.serverId),
                    inArray(taskLabelsTable.id, labelIds)
                )
            );
        if (found.length !== labelIds.length) {
            throw new IssueInvariantError('Every Issue label must be in this Server’s label catalog.');
        }
    }
    await tx
        .delete(issueLabelAssignmentsTable)
        .where(
            and(
                eq(issueLabelAssignmentsTable.serverId, input.serverId),
                eq(issueLabelAssignmentsTable.issueId, input.issueId)
            )
        );
    if (labelIds.length > 0) {
        await tx.insert(issueLabelAssignmentsTable).values(
            labelIds.map((labelId) => ({
                issueId: input.issueId,
                labelId,
                serverId: input.serverId,
            }))
        );
    }
}

export async function subscribeToIssue(
    tx: Pick<HausDatabase, 'insert'>,
    input: { issueId: string; serverId: string; userId: string }
) {
    await tx.insert(issueSubscriptionsTable).values(input).onConflictDoNothing();
}
