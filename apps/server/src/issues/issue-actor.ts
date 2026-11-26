import type { IssueActor } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    serverMembershipsTable,
    serversTable,
    tasksTable,
} from '../postgres/schema.ts';
import { requireServerMembership, ServerAccessDeniedError } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { IssueAssigneeArchivedError, IssueInvariantError } from './issue-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export interface ActorColumns {
    agentId: string | null;
    taskId: string | null;
    userId: string | null;
}

export function memberIssueActor(member: HausUser | null) {
    if (!member) {
        throw new ServerAccessDeniedError();
    }
    return { kind: 'user' as const, userId: member.id };
}

export async function requireIssueActor(db: Reader, serverId: string, actor: IssueActor) {
    if (actor.kind === 'user') {
        await requireServerMembership(db, { id: actor.userId }, serverId);
        return;
    }
    if (!(await actorStands(db, serverId, actor))) {
        throw new ServerAccessDeniedError();
    }
}

export async function requireIssueAssignee(db: Reader, serverId: string, assignee: IssueActor) {
    if (!(await actorStands(db, serverId, assignee))) {
        throw new IssueInvariantError(
            'An Issue is assigned to an active member, a Captain, or a Task of this Server.'
        );
    }
}

export async function requireActiveTaskAssignee(
    db: Reader,
    issue: { assignee: IssueActor | null; code: string | null; open: boolean; serverId: string }
) {
    const { assignee } = issue;
    if (!issue.open || assignee?.kind !== 'task') {
        return;
    }
    const [task] = await db
        .select({ archivedAt: tasksTable.archivedAt })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, issue.serverId), eq(tasksTable.id, assignee.taskId)))
        .limit(1);
    if (task?.archivedAt) {
        throw new IssueAssigneeArchivedError(issue.code);
    }
}

export function actorColumns(actor: IssueActor | null) {
    return {
        agentId: actor?.kind === 'captain' ? actor.agentId : null,
        taskId: actor?.kind === 'task' ? actor.taskId : null,
        userId: actor?.kind === 'user' ? actor.userId : null,
    } satisfies ActorColumns;
}

export function actorFromColumns(columns: ActorColumns) {
    if (columns.userId !== null) {
        return { kind: 'user', userId: columns.userId } satisfies IssueActor;
    }
    if (columns.agentId !== null) {
        return { agentId: columns.agentId, kind: 'captain' } satisfies IssueActor;
    }
    if (columns.taskId !== null) {
        return { kind: 'task', taskId: columns.taskId } satisfies IssueActor;
    }
    return null;
}

export function requiredActorFromColumns(columns: ActorColumns) {
    const actor = actorFromColumns(columns);
    if (!actor) {
        throw new Error('An Issue actor row names neither a person, a Captain, nor a Task.');
    }
    return actor;
}

async function actorStands(db: Reader, serverId: string, actor: IssueActor) {
    if (actor.kind === 'user') {
        const rows = await db
            .select({ userId: serverMembershipsTable.userId })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, serverId),
                    eq(serverMembershipsTable.userId, actor.userId),
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .limit(1);
        return rows.length > 0;
    }
    if (actor.kind === 'captain') {
        const rows = await db
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .innerJoin(serversTable, eq(serversTable.id, agentsTable.serverId))
            .where(
                and(
                    eq(agentsTable.serverId, serverId),
                    eq(agentsTable.id, actor.agentId),
                    isNull(agentsTable.retiredAt),
                    isNull(serversTable.deletedAt)
                )
            )
            .limit(1);
        return rows.length > 0;
    }
    const rows = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, actor.taskId)))
        .limit(1);
    return rows.length > 0;
}
