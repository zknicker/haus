import type { Issue, IssueDetail } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import type * as React from 'react';
import { useTasksById } from '../../hooks/tasks/use-tasks-by-id.ts';
import { TaskActivityChip } from '../tasks/task-activity.tsx';
import { useOpenTask } from '../tasks/use-open-task.ts';
import { IssueAssigneeMark } from './issue-facts.tsx';
import { IssueStateMark } from './issue-glyphs.tsx';
import { useOpenIssue } from './use-open-issue.ts';

export function IssueSection({
    children,
    count,
    title,
}: {
    children: React.ReactNode;
    count?: string;
    title: string;
}) {
    return (
        <section aria-label={title} className="issue-section">
            <h2 className="issue-section__title">
                {title}
                {count ? <span className="issue-section__count">{count}</span> : null}
            </h2>
            {children}
        </section>
    );
}

export function IssueLinkedTasks({ issue }: { issue: Issue }) {
    const tasks = useTasksById(issue.serverId, { enabled: issue.taskIds.length > 0 });
    const openTask = useOpenTask();
    const linked = issue.taskIds.flatMap((taskId) => tasks.get(taskId) ?? []);
    if (issue.taskIds.length === 0) {
        return null;
    }
    return (
        <IssueSection title="Tasks">
            <ListView
                aria-label="Linked tasks"
                className="task-list"
                onAction={(key) => {
                    const task = tasks.get(String(key));
                    if (task) {
                        openTask(task);
                    }
                }}
                variant="secondary"
            >
                {linked.map((task) => (
                    <ListView.Item id={task.id} key={task.id} textValue={task.title}>
                        <ListView.ItemContent>
                            <ListView.Title className="min-w-0">{task.title}</ListView.Title>
                        </ListView.ItemContent>
                        <ListView.ItemAction>
                            <span className="task-list__facts">
                                {task.id === assigneeTaskId(issue) ? (
                                    <span className="text-muted text-xs">Assignee</span>
                                ) : null}
                                <TaskActivityChip task={task} />
                            </span>
                        </ListView.ItemAction>
                    </ListView.Item>
                ))}
            </ListView>
        </IssueSection>
    );
}

export function IssuePullRequests({ pullRequests }: Pick<IssueDetail, 'pullRequests'>) {
    if (pullRequests.length === 0) {
        return null;
    }
    return (
        <IssueSection title="Pull requests">
            <ul className="issue-section__plain">
                {pullRequests.map((pr) => (
                    <li className="text-sm" key={`${pr.repository}#${pr.number}`}>
                        {pr.repository}#{pr.number}
                        {pr.state ? <span className="text-muted"> · {pr.state}</span> : null}
                    </li>
                ))}
            </ul>
        </IssueSection>
    );
}

export function IssueSubIssues({ subIssues }: Pick<IssueDetail, 'subIssues'>) {
    const openIssue = useOpenIssue();
    if (subIssues.length === 0) {
        return null;
    }
    const closed = subIssues.filter((sub) => sub.state.type === 'closed').length;
    return (
        <IssueSection count={`${closed}/${subIssues.length} closed`} title="Sub-issues">
            <ListView
                aria-label="Sub-issues"
                className="task-list"
                onAction={(key) => {
                    const sub = subIssues.find((candidate) => candidate.id === key);
                    if (sub) {
                        openIssue(sub);
                    }
                }}
                variant="secondary"
            >
                {subIssues.map((sub) => (
                    <ListView.Item id={sub.id} key={sub.id} textValue={`${sub.code} ${sub.title}`}>
                        <ListView.ItemContent>
                            <IssueStateMark state={sub.state.id} />
                            <span className="task-list__key">{sub.code}</span>
                            <ListView.Title className="min-w-0">{sub.title}</ListView.Title>
                        </ListView.ItemContent>
                        <ListView.ItemAction>
                            <IssueAssigneeMark assignee={sub.assignee} />
                        </ListView.ItemAction>
                    </ListView.Item>
                ))}
            </ListView>
        </IssueSection>
    );
}

function assigneeTaskId(issue: Issue) {
    return issue.assignee?.kind === 'task' ? issue.assignee.taskId : null;
}
