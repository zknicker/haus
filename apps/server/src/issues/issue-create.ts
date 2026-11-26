import {
    type IssueActor,
    type IssueChange,
    type IssueCreateInput,
    issueStateType,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { issuesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { allocateIssueNumber } from '../tasks/task-key-ledger.ts';
import {
    actorColumns,
    requireActiveTaskAssignee,
    requireIssueActor,
    requireIssueAssignee,
} from './issue-actor.ts';
import {
    appendIssueEvents,
    prepareIssueCreatedEvent,
    prepareIssueUpdatedEvent,
} from './issue-events.ts';
import {
    requireIssueParent,
    requireIssueProject,
    subscribeToIssue,
    writeIssueLabels,
} from './issue-fields.ts';
import { readIssue } from './issue-read.ts';
import { deriveIssueWrite } from './issue-wakes.ts';
import { settleIssueWrite } from './issue-write-effects.ts';
import { insertIssueTaskLink, type IssueWriteResult } from './issue-write.ts';

export async function createIssue(db: HausDatabase, actor: IssueActor, input: IssueCreateInput) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireIssueActor(tx, serverId, actor);
        const project = await requireIssueProject(tx, serverId, input.projectId);
        const assignee = input.assignee ?? null;
        const state = input.state ?? 'todo';
        if (assignee) {
            await requireIssueAssignee(tx, serverId, assignee);
            await requireActiveTaskAssignee(tx, {
                assignee,
                code: null,
                open: issueStateType(state) === 'open',
                serverId,
            });
        }
        const parent = input.parentId
            ? await requireIssueParent(tx, {
                  code: null,
                  issueId: null,
                  parentId: input.parentId,
                  projectId: input.projectId,
                  serverId,
              })
            : null;
        const number = await allocateIssueNumber(tx, { keyId: project.keyId, serverId });
        const id = createOpaqueId('iss');
        const creator = actorColumns(actor);
        const assigned = actorColumns(assignee);
        await tx.insert(issuesTable).values({
            assigneeAgentId: assigned.agentId,
            assigneeTaskId: assigned.taskId,
            assigneeUserId: assigned.userId,
            closedAt: issueStateType(state) === 'closed' ? sql`now()` : null,
            creatorAgentId: creator.agentId,
            creatorTaskId: creator.taskId,
            creatorUserId: creator.userId,
            description: input.description ?? '',
            dueOn: input.dueOn ?? null,
            id,
            keyId: project.keyId,
            number,
            parentId: parent?.id ?? null,
            priority: input.priority ?? 'normal',
            projectId: input.projectId,
            serverId,
            state,
            title: input.title,
        });
        if (input.labelIds) {
            await writeIssueLabels(tx, { issueId: id, labelIds: input.labelIds, serverId });
        }
        const changes: IssueChange[] = [{ kind: 'created' }];
        if (assignee?.kind === 'task') {
            await insertIssueTaskLink(tx, {
                actor,
                issueId: id,
                serverId,
                taskId: assignee.taskId,
            });
            changes.push({ kind: 'linked', taskId: assignee.taskId });
        }
        if (parent) {
            changes.push({ from: null, kind: 'parent_set', to: parent.code });
        }
        for (const userId of [creator.userId, assigned.userId]) {
            if (userId) {
                await subscribeToIssue(tx, { issueId: id, serverId, userId });
            }
        }
        const recorded = await appendIssueEvents(tx, { actor, changes, issueId: id, serverId });
        const issue = await readIssue(tx, serverId, id);
        const events = [prepareIssueCreatedEvent(issue)];
        if (parent) {
            await appendIssueEvents(tx, {
                actor,
                changes: [{ issue: issue.code, kind: 'sub_issue_added' }],
                issueId: parent.id,
                serverId,
            });
            events.push(prepareIssueUpdatedEvent(await readIssue(tx, serverId, parent.id)));
        }
        const wakes = deriveIssueWrite({ actor, after: issue, before: null, events: recorded });
        const settled = await settleIssueWrite(tx, { actor, before: null, events, issue, wakes });
        return { ...settled, issue, wakes } satisfies IssueWriteResult;
    });
}
