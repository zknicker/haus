import { type IssueActor, type IssueTaskLinkInput, sameIssueActor } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { issuesTable, issueTaskLinksTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireIssueActor } from './issue-actor.ts';
import { IssueInvariantError, requireIssueVersion } from './issue-errors.ts';
import { appendIssueEvents, prepareIssueUpdatedEvent } from './issue-events.ts';
import { lockIssue, readIssue } from './issue-read.ts';
import {
    insertIssueTaskLink,
    type IssueTx,
    type IssueWriteGuard,
    type IssueWriteResult,
} from './issue-write.ts';

export async function linkIssueTask(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueTaskLinkInput,
    guard?: IssueWriteGuard
) {
    return await writeLink(db, actor, input, guard, async (tx) => {
        await requireTask(tx, input.serverId, input.taskId);
        return await insertIssueTaskLink(tx, {
            actor,
            issueId: input.issueId,
            serverId: input.serverId,
            taskId: input.taskId,
        });
    });
}

export async function unlinkIssueTask(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueTaskLinkInput,
    guard?: IssueWriteGuard
) {
    return await writeLink(db, actor, input, guard, async (tx, issue) => {
        if (sameIssueActor(issue.assignee, { kind: 'task', taskId: input.taskId })) {
            throw new IssueInvariantError(
                `${issue.code} is assigned to that Task; reassign it before unlinking the Task.`
            );
        }
        const removed = await tx
            .delete(issueTaskLinksTable)
            .where(
                and(
                    eq(issueTaskLinksTable.serverId, input.serverId),
                    eq(issueTaskLinksTable.issueId, input.issueId),
                    eq(issueTaskLinksTable.taskId, input.taskId)
                )
            )
            .returning({ taskId: issueTaskLinksTable.taskId });
        return removed.length > 0;
    });
}

async function writeLink(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueTaskLinkInput,
    guard: IssueWriteGuard | undefined,
    change: (tx: IssueTx, issue: Awaited<ReturnType<typeof lockIssue>>) => Promise<boolean>
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const current = await lockIssue(tx, serverId, input.issueId);
        await guard?.(tx, current);
        requireIssueVersion(current.version, input.expectedVersion);
        const wasLinked = current.taskIds.includes(input.taskId);
        if (!(await change(tx, current))) {
            return {
                agentWakes: [],
                events: [],
                issue: current,
                wakes: [],
            } satisfies IssueWriteResult;
        }
        await tx
            .update(issuesTable)
            .set({ updatedAt: sql`now()`, version: sql`${issuesTable.version} + 1` })
            .where(and(eq(issuesTable.serverId, serverId), eq(issuesTable.id, current.id)));
        await appendIssueEvents(tx, {
            actor,
            changes: [{ kind: wasLinked ? 'unlinked' : 'linked', taskId: input.taskId }],
            issueId: current.id,
            serverId,
        });
        const issue = await readIssue(tx, serverId, current.id);
        return {
            agentWakes: [],
            events: [prepareIssueUpdatedEvent(issue)],
            issue,
            wakes: [],
        } satisfies IssueWriteResult;
    });
}

async function requireTask(db: Pick<HausDatabase, 'select'>, serverId: string, taskId: string) {
    const [task] = await db
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, taskId)))
        .limit(1);
    if (!task) {
        throw new IssueInvariantError('No Task exists with that id on this Server.');
    }
}
