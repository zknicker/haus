import type { TaskDetail } from '@haus/api';
import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import { useClearTaskInboxItem } from '../../hooks/task-inbox/use-clear-task-inbox-item.ts';
import { useTaskInboxItems } from '../../hooks/task-inbox/use-task-inbox-items.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { useServerContext } from '../servers/server-context.ts';
import { tasksRoute } from '../servers/server-routes.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskDescription } from './task-description.tsx';
import { TaskMentions, TaskReminders } from './task-links.tsx';
import { TaskProperties } from './task-properties.tsx';
import { TaskTitle } from './task-title.tsx';

/**
 * One Task under the route's band. A re-keyed board or a mistyped address
 * answers NOT_FOUND, and the check reads the error first because a background
 * refetch keeps the last good record beside it.
 */
export function TaskPage({ taskKey }: { taskKey: string }) {
    const { server } = useServerContext();
    const task = useTask(server.id, { key: taskKey });

    if (task.error?.data?.code === 'NOT_FOUND') {
        return <TaskUnavailable title="Task not found" />;
    }
    if (task.data) {
        return <TaskDetailView key={task.data.id} task={task.data} />;
    }
    return task.error ? <TaskUnavailable title="Task unavailable" /> : null;
}

function TaskDetailView({ task }: { task: TaskDetail }) {
    useClearOpenedTaskItem(task.id);

    return (
        <div className="@container min-h-0 flex-1 overflow-y-auto">
            <PageColumn className="grid @3xl:grid-cols-[minmax(0,1fr)_16rem] grid-cols-1 items-start gap-x-10">
                <div className="flex min-w-0 flex-col gap-8">
                    <div className="flex flex-col gap-4">
                        <TaskTitle task={task} />
                        <TaskDescription task={task} />
                    </div>
                    <TaskMentions mentions={task.mentions} />
                    <TaskReminders reminders={task.reminders} />
                </div>
                <TaskProperties task={task} />
            </PageColumn>
        </div>
    );
}

/** Opening a Task clears its Inbox item; a hidden desktop tab has not been opened yet. */
function useClearOpenedTaskItem(taskId: string) {
    const { server } = useServerContext();
    const { shown } = useTabPresence();
    const items = useTaskInboxItems(server.id).data;
    const clear = useClearTaskInboxItem().mutate;
    const hasItem = items?.some((item) => item.task.id === taskId) ?? false;

    React.useEffect(() => {
        if (hasItem && shown) {
            clear({ serverId: server.id, taskId });
        }
    }, [clear, hasItem, server.id, shown, taskId]);
}

function TaskUnavailable({ title }: { title: string }) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    return (
        <EmptyState className="flex-1">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon
                        aria-hidden="true"
                        icon={title === 'Task not found' ? Task01Icon : Alert02Icon}
                    />
                </EmptyState.Media>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>
                    The board may have a new key, or the address may be wrong.
                </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
                <Button
                    onPress={() => navigate(tasksRoute(server.slug))}
                    size="sm"
                    variant="secondary"
                >
                    Back to Tasks
                </Button>
            </EmptyState.Content>
        </EmptyState>
    );
}
