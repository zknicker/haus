import { type Issue, type IssueActor, sameIssueActor } from '@haus/api';
import type { RecordedIssueEvent } from './issue-events.ts';

export type IssueWakeRecipient =
    | { agentId: string; kind: 'captain' }
    | { kind: 'task'; taskId: string };

export interface IssueWake {
    identity: string;
    issueId: string;
    kind: 'issue_assignment' | 'issue_event';
    recipient: IssueWakeRecipient;
}

type IssueFacts = Pick<Issue, 'assignee' | 'state'>;

export function issueWakeRecipient(assignee: IssueActor | null): IssueWakeRecipient | null {
    if (assignee?.kind === 'captain') {
        return { agentId: assignee.agentId, kind: 'captain' };
    }
    if (assignee?.kind === 'task') {
        return { kind: 'task', taskId: assignee.taskId };
    }
    return null;
}

export function deriveIssueWrite(input: {
    actor: IssueActor;
    after: Issue;
    before: IssueFacts | null;
    events: readonly RecordedIssueEvent[];
}): IssueWake[] {
    const { actor, after, before } = input;
    const recipient = wakeable(actor, after.assignee);
    if (!recipient || after.state.id === 'backlog') {
        return [];
    }
    const assigned = before === null || !sameIssueActor(before.assignee, after.assignee);
    const leftBacklog = before?.state.id === 'backlog';
    if (assigned || leftBacklog) {
        return [
            {
                identity: `issue-assign:${after.id}:${after.version}`,
                issueId: after.id,
                kind: 'issue_assignment',
                recipient,
            },
        ];
    }
    return input.events
        .filter((event) => event.change.kind === 'state_changed')
        .map((event) => issueEvent(after.id, event.id, recipient));
}

export function deriveIssueComment(input: {
    actor: IssueActor;
    commentId: string;
    issue: IssueFacts & Pick<Issue, 'id'>;
}): IssueWake[] {
    const recipient = wakeable(input.actor, input.issue.assignee);
    return recipient ? [issueEvent(input.issue.id, input.commentId, recipient)] : [];
}

export function deriveSubIssuesClosed(input: {
    actor: IssueActor;
    eventId: string;
    parent: IssueFacts & Pick<Issue, 'closedSubIssueCount' | 'id' | 'subIssueCount'>;
}): IssueWake[] {
    const { parent } = input;
    if (parent.subIssueCount === 0 || parent.closedSubIssueCount < parent.subIssueCount) {
        return [];
    }
    const recipient = wakeable(input.actor, parent.assignee);
    return recipient ? [issueEvent(parent.id, input.eventId, recipient)] : [];
}

function wakeable(actor: IssueActor, assignee: IssueActor | null) {
    return sameIssueActor(actor, assignee) ? null : issueWakeRecipient(assignee);
}

function issueEvent(issueId: string, eventId: string, recipient: IssueWakeRecipient): IssueWake {
    return { identity: `issue-event:${issueId}:${eventId}`, issueId, kind: 'issue_event', recipient };
}
