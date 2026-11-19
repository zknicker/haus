import type { Task } from '@haus/api';
import { EmptyState, ListView } from '@heroui-pro/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTaskList } from '../../hooks/tasks/use-task-list.ts';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskAssigneeMark, TaskDueDate, TaskLabelChips } from './task-facts.tsx';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import { TaskRowMenu } from './task-row-menu.tsx';
import { TaskStateDisc } from './task-state-disc.tsx';
import { taskStateLabels } from './task-state.ts';
import {
    isFiltered,
    orderTasksForPage,
    readTasksPageFilters,
    taskListFilters,
} from './tasks-page-model.ts';
import { TasksToolbar } from './tasks-toolbar.tsx';
import { useOpenTask } from './use-open-task.ts';

export { TasksBandControls } from './tasks-band-controls.tsx';

export function TasksPage() {
    const { server } = useServerContext();
    const [params] = useSearchParams();
    const filters = readTasksPageFilters(params);
    const tasks = useTaskList(server.id, taskListFilters(filters));
    const ordered = React.useMemo(
        () => (tasks.data ? orderTasksForPage(tasks.data, filters.labelId) : null),
        [tasks.data, filters.labelId]
    );

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn>
                <TasksToolbar filters={filters} />
                {ordered === null ? (
                    tasks.error ? (
                        <TasksEmpty filtered={false} unavailable />
                    ) : null
                ) : ordered.length === 0 ? (
                    <TasksEmpty filtered={isFiltered(filters)} />
                ) : (
                    <TaskRows tasks={ordered} />
                )}
            </PageColumn>
        </div>
    );
}

function TaskRows({ tasks }: { tasks: readonly Task[] }) {
    const openTask = useOpenTask();
    return (
        <ListView
            aria-label="Tasks"
            items={tasks}
            onAction={(key) => {
                const task = tasks.find((candidate) => candidate.id === key);
                if (task) {
                    openTask(task);
                }
            }}
            variant="secondary"
        >
            {(task) => (
                <ListView.Item id={task.id} textValue={`${task.key} ${task.title}`}>
                    <ListView.ItemContent>
                        <span aria-label={taskStateLabels[task.state]} role="img">
                            <TaskStateDisc state={task.state} />
                        </span>
                        <span className="text-muted w-16 shrink-0 text-sm tabular-nums">
                            {task.key}
                        </span>
                        <TaskPriorityIcon className="text-muted" priority={task.priority} />
                        <ListView.Title className="min-w-0 flex-1">{task.title}</ListView.Title>
                        <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
                            <TaskLabelChips labelIds={task.labelIds} />
                        </span>
                        <TaskDueDate task={task} />
                        <TaskAssigneeMark assignee={task.assignee} />
                    </ListView.ItemContent>
                    <ListView.ItemAction>
                        <TaskRowMenu task={task} />
                    </ListView.ItemAction>
                </ListView.Item>
            )}
        </ListView>
    );
}

function TasksEmpty({
    filtered,
    unavailable = false,
}: {
    filtered: boolean;
    unavailable?: boolean;
}) {
    const title = unavailable
        ? 'Tasks unavailable'
        : filtered
          ? 'No matching tasks'
          : 'No tasks yet';
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={unavailable ? Alert02Icon : Task01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>{title}</EmptyState.Title>
                {unavailable || filtered ? null : (
                    <EmptyState.Description>
                        Ask a Captain to start one from a message.
                    </EmptyState.Description>
                )}
            </EmptyState.Header>
        </EmptyState>
    );
}
