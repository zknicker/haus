import { EmptyState } from '@heroui-pro/react';
import { Tabs } from '@heroui/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { useTaskList } from '../../hooks/tasks/use-task-list.ts';
import { useSetSearchParam } from '../issues/issue-filter-select.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskListRows } from './task-list-rows.tsx';
import {
    readTaskView,
    type TaskView,
    taskListFilters,
    tasksForView,
    taskViews,
} from './tasks-page-model.ts';

export function TasksPage() {
    const { server } = useServerContext();
    const [params] = useSearchParams();
    const view = readTaskView(params);
    const viewerUserId = useMembers(server.id).data?.viewerUserId ?? null;
    const tasks = useTaskList(server.id, taskListFilters(view));
    const shown = React.useMemo(
        () => (tasks.data ? tasksForView(tasks.data, view, viewerUserId) : null),
        [tasks.data, view, viewerUserId]
    );
    const label = taskViews.find((entry) => entry.id === view)?.label ?? 'Tasks';

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn className="@container max-w-none gap-2 px-3 pt-1">
                <TaskViewTabs view={view} />
                {shown === null ? (
                    tasks.error ? (
                        <TasksEmpty unavailable view={view} />
                    ) : null
                ) : shown.length === 0 ? (
                    <TasksEmpty view={view} />
                ) : (
                    <TaskListRows label={label} tasks={shown} />
                )}
            </PageColumn>
        </div>
    );
}

function TaskViewTabs({ view }: { view: TaskView }) {
    const setParam = useSetSearchParam();
    return (
        <Tabs
            onSelectionChange={(key) => setParam('view', key === 'mine' ? null : String(key))}
            selectedKey={view}
            variant="secondary"
        >
            <Tabs.ListContainer>
                <Tabs.List aria-label="Tasks">
                    {taskViews.map((entry) => (
                        <Tabs.Tab id={entry.id} key={entry.id}>
                            {entry.label}
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
            </Tabs.ListContainer>
        </Tabs>
    );
}

function TasksEmpty({ unavailable = false, view }: { unavailable?: boolean; view: TaskView }) {
    const title = unavailable
        ? 'Tasks unavailable'
        : view === 'archived'
          ? 'No archived tasks'
          : 'No tasks yet';
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={unavailable ? Alert02Icon : Task01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>{title}</EmptyState.Title>
                {unavailable || view === 'archived' ? null : (
                    <EmptyState.Description>
                        Start one from Home, or ask a Captain to.
                    </EmptyState.Description>
                )}
            </EmptyState.Header>
        </EmptyState>
    );
}
