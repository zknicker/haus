import {
    type Issue,
    type IssueActor,
    type IssueChange,
    type IssueUpdateInput,
    issueStateType,
    sameIssueActor,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import { issuesTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { issueActorLabel, nameIssueActors } from './issue-actor-names.ts';
import {
    actorColumns,
    requireActiveTaskAssignee,
    requireIssueActor,
    requireIssueAssignee,
} from './issue-actor.ts';
import { IssueTakenError, requireIssueVersion } from './issue-errors.ts';
import { appendIssueEvents, prepareIssueUpdatedEvent } from './issue-events.ts';
import { requireIssueParent, subscribeToIssue, writeIssueLabels } from './issue-fields.ts';
import { lockIssue, readIssue } from './issue-read.ts';
import { deriveIssueWrite, deriveSubIssuesClosed, type IssueWake } from './issue-wakes.ts';
import { settleIssueWrite } from './issue-write-effects.ts';
import {
    insertIssueTaskLink,
    type IssueTx,
    type IssueWriteGuard,
    type IssueWriteResult,
} from './issue-write.ts';

export async function updateIssue(
    db: HausDatabase,
    actor: IssueActor,
    input: IssueUpdateInput,
    guard?: IssueWriteGuard
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const current = await lockIssue(tx, serverId, input.issueId);
        await guard?.(tx, current);
        requireIssueVersion(current.version, input.expectedVersion);
        if (input.expectAssignee !== undefined) {
            await requireExpectedAssignee(tx, current, input.expectAssignee);
        }
        const changes = await applyPatch(tx, actor, current, input.patch);
        if (changes.length === 0) {
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
        const recorded = await appendIssueEvents(tx, {
            actor,
            changes,
            issueId: current.id,
            serverId,
        });
        const issue = await readIssue(tx, serverId, current.id);
        if (
            !sameIssueActor(current.assignee, issue.assignee) ||
            current.state.type !== issue.state.type
        ) {
            await requireActiveTaskAssignee(tx, { ...issue, open: issue.state.type === 'open' });
        }
        const events = [prepareIssueUpdatedEvent(issue)];
        const wakes: IssueWake[] = [
            ...deriveIssueWrite({ actor, after: issue, before: current, events: recorded }),
        ];
        await recordParentChanges(tx, { actor, current, events, issue });
        const closed = recorded.find((event) => event.change.kind === 'state_changed');
        if (closed && issue.parentId && closedNow(current, issue)) {
            const parent = await readIssue(tx, serverId, issue.parentId);
            wakes.push(...deriveSubIssuesClosed({ actor, eventId: closed.id, parent }));
        }
        const settled = await settleIssueWrite(tx, {
            actor,
            before: current,
            events,
            issue,
            wakes,
        });
        return { ...settled, issue, wakes } satisfies IssueWriteResult;
    });
}

async function requireExpectedAssignee(tx: IssueTx, issue: Issue, expected: IssueActor | null) {
    if (sameIssueActor(issue.assignee, expected)) {
        return;
    }
    const name = await nameIssueActors(tx, issue.serverId, [issue.assignee]);
    throw new IssueTakenError(issue.code, issueActorLabel(issue.assignee && name(issue.assignee)));
}

async function applyPatch(
    tx: IssueTx,
    actor: IssueActor,
    current: Issue,
    patch: IssueUpdateInput['patch']
) {
    const { serverId } = current;
    const { changes, columns } = scalarPatch(current, patch);
    if (patch.labelIds !== undefined && !sameSet(patch.labelIds, current.labelIds)) {
        await writeIssueLabels(tx, { issueId: current.id, labelIds: patch.labelIds, serverId });
        changes.push({ from: current.labelIds, kind: 'labels_changed', to: [...patch.labelIds] });
    }
    if (patch.assignee !== undefined && !sameIssueActor(patch.assignee, current.assignee)) {
        changes.push(...(await changeAssignee(tx, actor, current, patch.assignee)));
        const assigned = actorColumns(patch.assignee);
        columns.assigneeAgentId = assigned.agentId;
        columns.assigneeTaskId = assigned.taskId;
        columns.assigneeUserId = assigned.userId;
    }
    if (patch.parentId !== undefined && patch.parentId !== current.parentId) {
        const parent = await changeParent(tx, current, patch.parentId);
        columns.parentId = parent.id;
        changes.push({ from: parent.from, kind: 'parent_set', to: parent.to });
    }
    if (Object.keys(columns).length > 0) {
        await tx
            .update(issuesTable)
            .set(columns)
            .where(and(eq(issuesTable.serverId, serverId), eq(issuesTable.id, current.id)));
    }
    return changes;
}

function scalarPatch(current: Issue, patch: IssueUpdateInput['patch']) {
    const changes: IssueChange[] = [];
    const columns: PgUpdateSetSource<typeof issuesTable> = {};
    if (patch.title !== undefined && patch.title !== current.title) {
        columns.title = patch.title;
        changes.push({ from: current.title, kind: 'title_changed', to: patch.title });
    }
    if (patch.description !== undefined && patch.description !== current.description) {
        columns.description = patch.description;
        changes.push({ kind: 'description_edited' });
    }
    if (patch.state !== undefined && patch.state !== current.state.id) {
        columns.state = patch.state;
        columns.closedAt = issueStateType(patch.state) === 'closed' ? sql`now()` : null;
        changes.push({ from: current.state.id, kind: 'state_changed', to: patch.state });
    }
    if (patch.priority !== undefined && patch.priority !== current.priority) {
        columns.priority = patch.priority;
        changes.push({ from: current.priority, kind: 'priority_changed', to: patch.priority });
    }
    if (patch.dueOn !== undefined && patch.dueOn !== current.dueOn) {
        columns.dueOn = patch.dueOn;
        changes.push({ from: current.dueOn, kind: 'due_changed', to: patch.dueOn });
    }
    return { changes, columns };
}

async function changeParent(tx: IssueTx, current: Issue, parentId: string | null) {
    const { serverId } = current;
    const parent = parentId
        ? await requireIssueParent(tx, {
              code: current.code,
              issueId: current.id,
              parentId,
              projectId: current.projectId,
              serverId,
          })
        : null;
    const from = current.parentId ? (await readIssue(tx, serverId, current.parentId)).code : null;
    return { from, id: parent?.id ?? null, to: parent?.code ?? null };
}

async function changeAssignee(
    tx: IssueTx,
    actor: IssueActor,
    current: Issue,
    next: IssueActor | null
) {
    const { serverId } = current;
    const changes: IssueChange[] = [{ from: current.assignee, kind: 'assignee_changed', to: next }];
    if (next) {
        await requireIssueAssignee(tx, serverId, next);
    }
    if (next?.kind === 'user') {
        await subscribeToIssue(tx, { issueId: current.id, serverId, userId: next.userId });
    }
    if (next?.kind === 'task') {
        const linked = await insertIssueTaskLink(tx, {
            actor,
            issueId: current.id,
            serverId,
            taskId: next.taskId,
        });
        if (linked) {
            changes.push({ kind: 'linked', taskId: next.taskId });
        }
    }
    return changes;
}

async function recordParentChanges(
    tx: IssueTx,
    input: { actor: IssueActor; current: Issue; events: PreparedRealtimeEvent[]; issue: Issue }
) {
    const { actor, current, events, issue } = input;
    const { serverId } = issue;
    const touched = new Set<string>();
    if (current.parentId !== issue.parentId) {
        for (const [parentId, kind] of [
            [current.parentId, 'sub_issue_removed'],
            [issue.parentId, 'sub_issue_added'],
        ] as const) {
            if (parentId) {
                await appendIssueEvents(tx, {
                    actor,
                    changes: [{ issue: issue.code, kind }],
                    issueId: parentId,
                    serverId,
                });
                touched.add(parentId);
            }
        }
    }
    if (issue.parentId && current.state.type !== issue.state.type) {
        touched.add(issue.parentId);
    }
    for (const parentId of touched) {
        events.push(prepareIssueUpdatedEvent(await readIssue(tx, serverId, parentId)));
    }
}

function closedNow(before: Issue, after: Issue) {
    return before.state.type === 'open' && after.state.type === 'closed';
}

function sameSet(left: readonly string[], right: readonly string[]) {
    const set = new Set(left);
    return set.size === new Set(right).size && right.every((id) => set.has(id));
}
