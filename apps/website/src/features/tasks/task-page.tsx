import type { TaskDetail } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { AgentPanel } from '../agent-panel/agent-panel.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { tasksRoute } from '../servers/server-routes.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskConversation } from './conversation/task-conversation.tsx';
import { TaskHistoryDetails } from './details/task-history-details.tsx';
import { TaskWorkPanel } from './work/task-work-panel.tsx';

export { TaskBandControls } from './task-band-controls.tsx';

export function TaskPage({ shortId }: { shortId: string }) {
    const { server } = useServerContext();
    const task = useTask(server.id, { shortId });

    if (task.error?.data?.code === 'NOT_FOUND') {
        return <TaskUnavailable title="Task not found" />;
    }
    if (task.data) {
        return task.data.chatId ? (
            <div className="relative flex min-h-0 flex-1" key={task.data.id}>
                <TaskConversation
                    chatId={task.data.chatId}
                    origin={task.data.origin}
                    title={task.data.title}
                />
                <AgentPanel server={server} subject={{ kind: 'task', shortId }} />
            </div>
        ) : (
            <TaskHistoryView key={task.data.id} task={task.data} />
        );
    }
    return task.error ? <TaskUnavailable title="Task unavailable" /> : null;
}

function TaskHistoryView({ task }: { task: TaskDetail }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <PageColumn>
                <TaskHistoryDetails task={task} />
                <TaskWorkPanel task={task} />
            </PageColumn>
        </div>
    );
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
                <EmptyState.Description>The address may be wrong.</EmptyState.Description>
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
