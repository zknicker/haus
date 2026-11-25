import type { Task } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { GridListHeader, GridListSection } from 'react-aria-components';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { TaskAssigneeMark, TaskDueDate, TaskLabelChips } from './task-facts.tsx';
import { taskPriorityLabels } from './task-presentation.ts';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import { TaskRowMenu } from './task-row-menu.tsx';
import { TaskStateDisc } from './task-state-disc.tsx';
import { taskStateLabels } from './task-state.ts';
import { groupTasksByState, type TaskStateGroup, taskAge } from './tasks-page-model.ts';
import { useOpenTask } from './use-open-task.ts';

export function TaskListRows({ tasks }: { tasks: readonly Task[] }) {
    const openTask = useOpenTask();
    const now = useRelativeNow(60_000);
    const groups = groupTasksByState(tasks);
    return (
        <ListView
            aria-label="Tasks"
            className="task-list"
            onAction={(key) => {
                const task = tasks.find((candidate) => candidate.id === key);
                if (task) {
                    openTask(task);
                }
            }}
            variant="secondary"
        >
            {groups.map((group) => (
                <TaskStateSection group={group} key={group.state} now={now} />
            ))}
        </ListView>
    );
}

function TaskStateSection({ group, now }: { group: TaskStateGroup; now: number }) {
    return (
        <GridListSection className="task-list__group" id={group.state}>
            <GridListHeader className="task-list__group-label">
                {taskStateLabels[group.state]}
                <span className="task-list__group-count">{group.tasks.length}</span>
            </GridListHeader>
            {group.tasks.map((task) => (
                <TaskListRow key={task.id} now={now} task={task} />
            ))}
        </GridListSection>
    );
}

function TaskListRow({ now, task }: { now: number; task: Task }) {
    return (
        <ListView.Item id={task.id} textValue={`${task.key} ${task.title}`}>
            <ListView.ItemContent>
                <span aria-label={taskStateLabels[task.state]} role="img">
                    <TaskStateDisc state={task.state} />
                </span>
                <span className="task-list__key">{task.key}</span>
                <ListView.Title className="min-w-0">{task.title}</ListView.Title>
                <span className="task-list__labels">
                    <TaskLabelChips labelIds={task.labelIds} />
                </span>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="task-list__facts">
                    <TaskDueDate task={task} />
                    <TaskAssigneeMark assignee={task.assignee} />
                    <span aria-label={`${taskPriorityLabels[task.priority]} priority`} role="img">
                        <TaskPriorityIcon className="text-muted" priority={task.priority} />
                    </span>
                    <span
                        className="task-list__age"
                        title={`Created ${createdFormat.format(new Date(task.createdAt))}`}
                    >
                        {taskAge(task, now)}
                    </span>
                    <span className="task-list__menu">
                        <TaskRowMenu task={task} />
                    </span>
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}

const createdFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
});
