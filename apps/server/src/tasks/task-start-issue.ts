import { type Issue, sameIssueActor } from '@haus/api';
import { findIssueByCode } from '../issues/issue-read.ts';
import { updateIssue } from '../issues/issue-update.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { TaskInvariantError } from './task-errors.ts';
import { notHomeProjectError } from './task-project.ts';

/**
 * `haus task start --issue` (specs/issues.md#claiming): an open Issue in the Captain's home
 * Project. Whether it is the caller's or nobody's is checked by the assignment's compare-and-swap.
 */
export async function readStartIssue(
    db: HausDatabase,
    input: { captainId: string; code: string; homeProjectId: string; serverId: string }
) {
    const issue = await findIssueByCode(db, input.serverId, input.code);
    if (issue.projectId !== input.homeProjectId) {
        throw await notHomeProjectError(db, { projectId: issue.projectId, serverId: input.serverId });
    }
    if (issue.state.type !== 'open') {
        throw new TaskInvariantError(
            `${issue.code} is ${issue.state.id.replaceAll('_', ' ')}, so no Task started for it.`
        );
    }
    return issue;
}

/** Links and assigns the Issue to the new Task, never changing its state; it queues no wake. */
export async function assignStartIssue(
    db: HausDatabase,
    issue: Issue,
    input: { captainId: string; taskId: string }
) {
    const captain = { agentId: input.captainId, kind: 'captain' } as const;
    const written = await updateIssue(db, captain, {
        expectAssignee: sameIssueActor(issue.assignee, captain) ? captain : null,
        expectedVersion: issue.version,
        issueId: issue.id,
        patch: { assignee: { kind: 'task', taskId: input.taskId } },
        serverId: issue.serverId,
    });
    return written.events;
}
