import {
    closedIssueStates,
    type Issue,
    type IssuePriority,
    type IssueState,
    issuePriorities,
    issueStates,
} from '@haus/api';
import type { StatusDiscKind } from '../tasks/task-status-disc.tsx';

export const issueStateOrder: readonly IssueState[] = issueStates;

export const issueStateLabels: Record<IssueState, string> = {
    backlog: 'Backlog',
    canceled: 'Canceled',
    done: 'Done',
    in_progress: 'In progress',
    todo: 'Todo',
};

export const issueStateDiscs: Record<IssueState, StatusDiscKind> = {
    backlog: 'todo',
    canceled: 'closed',
    done: 'done',
    in_progress: 'in_progress',
    todo: 'planned',
};

export const issueListStateOrder: readonly IssueState[] = [
    'in_progress',
    'todo',
    'backlog',
    'done',
    'canceled',
];

export const issuePriorityOrder: readonly IssuePriority[] = issuePriorities;

export const issuePriorityLabels: Record<IssuePriority, string> = {
    high: 'High',
    low: 'Low',
    normal: 'Normal',
    urgent: 'Urgent',
};

export function isIssueState(value: unknown): value is IssueState {
    return issueStateOrder.includes(value as IssueState);
}

export function isIssuePriority(value: unknown): value is IssuePriority {
    return issuePriorityOrder.includes(value as IssuePriority);
}

export function issueStateRef(state: IssueState) {
    const ref: Issue['state'] = (closedIssueStates as readonly IssueState[]).includes(state)
        ? { id: state, type: 'closed' }
        : { id: state, type: 'open' };
    return ref;
}
