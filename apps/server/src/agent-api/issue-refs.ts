import { type Issue, type IssueActor, sameIssueActor } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import {
    IssueInvariantError,
    IssueNotFoundError,
    IssueProjectNotHomeError,
} from '../issues/issue-errors.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    projectsTable,
    serverMembershipsTable,
    taskKeysTable,
    taskLabelsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { stripAt } from './claim-row.ts';

type Reader = Pick<HausDatabase, 'select'>;

export function agentIssueActor(runner: Pick<ResolvedRunner, 'agentId'>) {
    return { agentId: runner.agentId, kind: 'captain' as const };
}

export async function resolveIssueActorRef(db: Reader, runner: ResolvedRunner, ref: string) {
    if (ref === 'me') {
        return agentIssueActor(runner);
    }
    if (ref.startsWith('task:')) {
        return await resolveTaskRef(db, runner.serverId, ref.slice('task:'.length));
    }
    const handle = stripAt(ref);
    const [agent] = await db
        .select({ agentId: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                sql`lower(${agentsTable.handle}) = lower(${handle})`,
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    const [human] = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, runner.serverId),
                sql`lower(${serverMembershipsTable.handle}) = lower(${handle})`,
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    if (agent && human) {
        throw new IssueInvariantError(`@${handle} names both a person and a Captain.`);
    }
    if (agent) {
        return { agentId: agent.agentId, kind: 'captain' } satisfies IssueActor;
    }
    if (human) {
        return { kind: 'user', userId: human.userId } satisfies IssueActor;
    }
    throw new IssueInvariantError(`Nobody on this Server has the handle @${handle}.`);
}

export async function resolveIssueLabels(db: Reader, serverId: string, names: readonly string[]) {
    if (names.length === 0) {
        return [];
    }
    const wanted = [...new Set(names.map((name) => name.toLowerCase()))];
    const labels = await db
        .select({ id: taskLabelsTable.id, name: sql<string>`lower(${taskLabelsTable.name})` })
        .from(taskLabelsTable)
        .where(
            and(
                eq(taskLabelsTable.serverId, serverId),
                inArray(sql`lower(${taskLabelsTable.name})`, wanted)
            )
        );
    const byName = new Map(labels.map((label) => [label.name, label.id]));
    const missing = wanted.filter((name) => !byName.has(name));
    if (missing.length > 0) {
        throw new IssueInvariantError(`No label is named: ${missing.join(', ')}.`);
    }
    return wanted.flatMap((name) => byName.get(name) ?? []);
}

export async function requireAgentHomeProject(db: Reader, runner: ResolvedRunner) {
    const [agent] = await db
        .select({ homeProjectId: agentsTable.homeProjectId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!agent?.homeProjectId) {
        throw new IssueProjectNotHomeError(null);
    }
    return agent.homeProjectId;
}

export async function requireIssueWriter(db: Reader, runner: ResolvedRunner, issue: Issue) {
    if (sameIssueActor(issue.assignee, agentIssueActor(runner))) {
        return;
    }
    if ((await requireAgentHomeProject(db, runner)) !== issue.projectId) {
        throw new IssueProjectNotHomeError(issue.code);
    }
}

export async function resolveProjectKey(db: Reader, serverId: string, key: string) {
    const [project] = await db
        .select({ projectId: projectsTable.chatId })
        .from(projectsTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(and(eq(projectsTable.serverId, serverId), eq(taskKeysTable.key, key)))
        .limit(1);
    if (!project) {
        throw new IssueNotFoundError(`No Project has the key ${key}.`);
    }
    return project.projectId;
}

async function resolveTaskRef(db: Reader, serverId: string, taskId: string) {
    const [task] = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, taskId)))
        .limit(1);
    if (!task) {
        throw new IssueNotFoundError(`No Task ${taskId} exists on this Server.`);
    }
    return { kind: 'task', taskId: task.id } satisfies IssueActor;
}
