import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTaskList } from '../../hooks/tasks/use-task-list.ts';
import { useServerContext } from '../servers/server-context.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskListRows } from './task-list-rows.tsx';
import {
    isFiltered,
    orderTasksForPage,
    readTasksPageFilters,
    taskListFilters,
} from './tasks-page-model.ts';
import { ClearFiltersButton, TasksToolbar } from './tasks-toolbar.tsx';

export { TasksBandControls } from './tasks-band-controls.tsx';

export function TasksPage() {
    const { server } = useServerContext();
    const [params] = useSearchParams();
    const filters = readTasksPageFilters(params);
    const tasks = useTaskList(server.id, taskListFilters(filters));
    const ordered = React.useMemo(
        () => (tasks.data ? orderTasksForPage(tasks.data) : null),
        [tasks.data]
    );

    const filtered = isFiltered(filters);
    const showToolbar = ordered !== null && (ordered.length > 0 || filtered);

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn className="@container max-w-none gap-2 px-3 pt-1">
                {showToolbar ? <TasksToolbar filters={filters} /> : null}
                {ordered === null ? (
                    tasks.error ? (
                        <TasksEmpty filtered={false} unavailable />
                    ) : null
                ) : ordered.length === 0 ? (
                    <TasksEmpty filtered={filtered} />
                ) : (
                    <TaskListRows tasks={ordered} />
                )}
            </PageColumn>
        </div>
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
            {filtered && !unavailable ? (
                <EmptyState.Content>
                    <ClearFiltersButton variant="secondary" />
                </EmptyState.Content>
            ) : null}
        </EmptyState>
    );
}
