import { type Issue, type IssueState, issueStateType } from '@haus/api';

export function issuesWaitingOnPeople(issues: readonly Issue[]) {
    return issues.filter(
        (issue) => issueStateType(issue.state.id) === 'open' && issue.assignee?.kind === 'user'
    );
}

export function issueCodeByTask(issues: readonly Issue[]) {
    const codes = new Map<string, string>();
    for (const issue of issues) {
        for (const taskId of issue.taskIds) {
            if (!codes.has(taskId)) {
                codes.set(taskId, issue.code);
            }
        }
    }
    return codes;
}

export function crewRowTitle(title: string, code: string | undefined) {
    return code ? `${code} · ${title}` : title;
}

export const issueGroupOrder = [
    'in_progress',
    'todo',
    'backlog',
    'done',
    'canceled',
] as const satisfies readonly IssueState[];

export const issueStateLabels: Record<IssueState, string> = {
    backlog: 'Backlog',
    canceled: 'Canceled',
    done: 'Done',
    in_progress: 'In progress',
    todo: 'Todo',
};

export function issueGroupStartsOpen(state: IssueState) {
    return issueStateType(state) === 'open';
}

export function issueGroups(issues: readonly Issue[]) {
    return issueGroupOrder.flatMap((state) => {
        const rows = issues
            .filter((issue) => issue.state.id === state)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        return rows.length > 0 ? [{ issues: rows, state }] : [];
    });
}
