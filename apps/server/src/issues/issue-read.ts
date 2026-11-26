import { formatIssueCode, type Issue, issueSchema, issueStateType, parseIssueCode } from '@haus/api';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { issuesTable, taskKeysTable } from '../postgres/schema.ts';
import { actorFromColumns, requiredActorFromColumns } from './issue-actor.ts';
import { IssueNotFoundError } from './issue-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

const issueRowColumns = {
    assigneeAgentId: issuesTable.assigneeAgentId,
    assigneeTaskId: issuesTable.assigneeTaskId,
    assigneeUserId: issuesTable.assigneeUserId,
    closedAt: issuesTable.closedAt,
    closedSubIssueCount: sql<number>`(
        select count(*)::int from issues child
        where child.server_id = ${issuesTable.serverId}
            and child.parent_id = ${issuesTable.id}
            and child.state in ('done', 'canceled')
    )`,
    createdAt: issuesTable.createdAt,
    creatorAgentId: issuesTable.creatorAgentId,
    creatorTaskId: issuesTable.creatorTaskId,
    creatorUserId: issuesTable.creatorUserId,
    description: issuesTable.description,
    dueOn: issuesTable.dueOn,
    id: issuesTable.id,
    key: taskKeysTable.key,
    labelIds: sql<string[]>`coalesce((
        select array_agg(assignment.label_id order by assignment.label_id)
        from issue_label_assignments assignment
        where assignment.issue_id = ${issuesTable.id}
    ), '{}')`,
    number: issuesTable.number,
    parentId: issuesTable.parentId,
    priority: issuesTable.priority,
    projectId: issuesTable.projectId,
    serverId: issuesTable.serverId,
    state: issuesTable.state,
    subIssueCount: sql<number>`(
        select count(*)::int from issues child
        where child.server_id = ${issuesTable.serverId} and child.parent_id = ${issuesTable.id}
    )`,
    taskIds: sql<string[]>`coalesce((
        select array_agg(link.task_id order by link.linked_at desc, link.task_id)
        from issue_task_links link
        where link.issue_id = ${issuesTable.id}
    ), '{}')`,
    title: issuesTable.title,
    updatedAt: issuesTable.updatedAt,
    version: issuesTable.version,
};

export async function readIssues(db: Reader, serverId: string, where?: SQL) {
    const rows = await selectIssueRows(db, serverId, where);
    return rows.map(toIssue);
}

export async function readIssue(db: Reader, serverId: string, issueId: string) {
    const [issue] = await readIssues(db, serverId, eq(issuesTable.id, issueId));
    if (!issue) {
        throw new IssueNotFoundError();
    }
    return issue;
}

export async function lockIssue(
    tx: Pick<HausDatabase, 'select'>,
    serverId: string,
    issueId: string
) {
    const [row] = await tx
        .select({ id: issuesTable.id })
        .from(issuesTable)
        .where(and(eq(issuesTable.serverId, serverId), eq(issuesTable.id, issueId)))
        .for('update');
    if (!row) {
        throw new IssueNotFoundError();
    }
    return await readIssue(tx, serverId, issueId);
}

export async function findIssueByCode(db: Reader, serverId: string, code: string) {
    const parsed = parseIssueCode(code);
    if (!parsed) {
        throw new IssueNotFoundError(`${code} is not an Issue code.`);
    }
    const [issue] = await readIssues(
        db,
        serverId,
        and(eq(taskKeysTable.key, parsed.key), eq(issuesTable.number, parsed.number))
    );
    if (!issue) {
        throw new IssueNotFoundError(`No Issue ${code} exists on this Server.`);
    }
    return issue;
}

type IssueRow = Awaited<ReturnType<typeof selectIssueRows>>[number];

function selectIssueRows(db: Reader, serverId: string, where: SQL | undefined) {
    return db
        .select(issueRowColumns)
        .from(issuesTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, issuesTable.serverId),
                eq(taskKeysTable.id, issuesTable.keyId)
            )
        )
        .where(and(eq(issuesTable.serverId, serverId), where))
        .orderBy(issuesTable.createdAt, issuesTable.id);
}

function toIssue(row: IssueRow): Issue {
    return issueSchema.parse({
        assignee: actorFromColumns({
            agentId: row.assigneeAgentId,
            taskId: row.assigneeTaskId,
            userId: row.assigneeUserId,
        }),
        closedAt: row.closedAt?.toISOString() ?? null,
        closedSubIssueCount: row.closedSubIssueCount,
        code: formatIssueCode(row.key, row.number),
        createdAt: row.createdAt.toISOString(),
        creator: requiredActorFromColumns({
            agentId: row.creatorAgentId,
            taskId: row.creatorTaskId,
            userId: row.creatorUserId,
        }),
        description: row.description,
        dueOn: row.dueOn,
        id: row.id,
        labelIds: row.labelIds,
        number: row.number,
        parentId: row.parentId,
        priority: row.priority,
        projectId: row.projectId,
        serverId: row.serverId,
        state: { id: row.state, type: issueStateType(row.state) },
        subIssueCount: row.subIssueCount,
        taskIds: row.taskIds,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    });
}
