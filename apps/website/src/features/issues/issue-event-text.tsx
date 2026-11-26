import type { IssueActor, IssueChange } from '@haus/api';
import { useServerContext } from '../servers/server-context.ts';
import { useIssueActor } from './issue-actor.ts';
import { formatDueOn } from './issue-facts.tsx';
import { issuePriorityLabels, issueStateLabels } from './issue-state.ts';

export function ActorName({ actor }: { actor: IssueActor | null }) {
    const { server } = useServerContext();
    const person = useIssueActor(server.id, actor);
    return <span className="text-foreground font-medium">{person?.label ?? 'Haus'}</span>;
}

export function IssueChangeText({ change }: { change: IssueChange }) {
    switch (change.kind) {
        case 'created':
            return 'created the issue';
        case 'state_changed':
            return `moved it from ${issueStateLabels[change.from]} to ${issueStateLabels[change.to]}`;
        case 'priority_changed':
            return `set priority to ${issuePriorityLabels[change.to]}`;
        case 'assignee_changed':
            return change.to ? (
                <>
                    assigned it to <ActorName actor={change.to} />
                </>
            ) : (
                'removed the assignee'
            );
        case 'title_changed':
            return `renamed it to “${change.to}”`;
        case 'description_edited':
            return 'edited the description';
        case 'parent_set':
            return change.to ? `set the parent to ${change.to}` : 'removed the parent';
        case 'sub_issue_added':
            return `added sub-issue ${change.issue}`;
        case 'sub_issue_removed':
            return `removed sub-issue ${change.issue}`;
        case 'linked':
            return (
                <>
                    linked <ActorName actor={{ kind: 'task', taskId: change.taskId }} />
                </>
            );
        case 'unlinked':
            return (
                <>
                    unlinked <ActorName actor={{ kind: 'task', taskId: change.taskId }} />
                </>
            );
        case 'due_changed':
            return change.to
                ? `set the due date to ${formatDueOn(change.to)}`
                : 'cleared the due date';
        case 'labels_changed':
            return 'changed the labels';
    }
}
