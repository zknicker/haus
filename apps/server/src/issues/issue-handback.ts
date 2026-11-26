import { type IssueActor, openIssueStates, type TaskActor } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
    agentsTable,
    issuesTable,
    serverMembershipsTable,
    tasksTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { actorColumns } from './issue-actor.ts';
import { appendIssueEvents, prepareIssueUpdatedEvent } from './issue-events.ts';
import { subscribeToIssue } from './issue-fields.ts';
import type { IssueAgentWake } from './issue-inbox.ts';
import { lockIssue, readIssue } from './issue-read.ts';
import { deriveIssueWrite } from './issue-wakes.ts';
import { settleIssueWrite } from './issue-write-effects.ts';
import type { IssueTx } from './issue-write.ts';

export async function handBackArchivedTaskIssues(
    tx: IssueTx,
    input: { actor: TaskActor; serverId: string; taskId: string }
) {
    const { serverId, taskId } = input;
    const actor = issueActorOf(input.actor);
    const events: PreparedRealtimeEvent[] = [];
    const agentWakes: IssueAgentWake[] = [];
    const rows = await tx
        .select({ id: issuesTable.id })
        .from(issuesTable)
        .where(
            and(
                eq(issuesTable.serverId, serverId),
                eq(issuesTable.assigneeTaskId, taskId),
                inArray(issuesTable.state, [...openIssueStates])
            )
        )
        .orderBy(issuesTable.id);
    if (rows.length === 0) {
        return { agentWakes, events };
    }
    const next = await readHandBackAssignee(tx, serverId, taskId);
    const columns = actorColumns(next);
    for (const { id } of rows) {
        const current = await lockIssue(tx, serverId, id);
        await tx
            .update(issuesTable)
            .set({
                assigneeAgentId: columns.agentId,
                assigneeTaskId: null,
                assigneeUserId: columns.userId,
                updatedAt: sql`now()`,
                version: sql`${issuesTable.version} + 1`,
            })
            .where(and(eq(issuesTable.serverId, serverId), eq(issuesTable.id, id)));
        if (columns.userId) {
            await subscribeToIssue(tx, { issueId: id, serverId, userId: columns.userId });
        }
        const recorded = await appendIssueEvents(tx, {
            actor: null,
            changes: [{ from: current.assignee, kind: 'assignee_changed', to: next }],
            issueId: id,
            serverId,
        });
        const issue = await readIssue(tx, serverId, id);
        const settled = await settleIssueWrite(tx, {
            actor,
            before: current,
            events: [prepareIssueUpdatedEvent(issue)],
            issue,
            wakes: deriveIssueWrite({ actor, after: issue, before: current, events: recorded }),
        });
        events.push(...settled.events);
        agentWakes.push(...settled.agentWakes);
    }
    return { agentWakes, events };
}

async function readHandBackAssignee(tx: IssueTx, serverId: string, taskId: string) {
    const [task] = await tx
        .select({
            agentId: agentsTable.id,
            userId: serverMembershipsTable.userId,
        })
        .from(tasksTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, tasksTable.serverId),
                eq(agentsTable.id, tasksTable.createdByAgentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, tasksTable.serverId),
                eq(serverMembershipsTable.userId, tasksTable.createdByUserId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, taskId)))
        .limit(1);
    if (task?.agentId) {
        return { agentId: task.agentId, kind: 'captain' } satisfies IssueActor;
    }
    return task?.userId ? ({ kind: 'user', userId: task.userId } satisfies IssueActor) : null;
}

function issueActorOf(actor: TaskActor) {
    return actor.kind === 'agent'
        ? ({ agentId: actor.agentId, kind: 'captain' } satisfies IssueActor)
        : ({ kind: 'user', userId: actor.userId } satisfies IssueActor);
}
