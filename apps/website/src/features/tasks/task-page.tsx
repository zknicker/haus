import type { TaskDetail } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { cn } from '../../lib/utils.ts';
import { useServerContext } from '../servers/server-context.ts';
import { tasksRoute, workerRoute } from '../servers/server-routes.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { WorkerOpenContext } from '../workers/worker-open-context.tsx';
import { WorkerSummariesProvider } from '../workers/worker-summaries.tsx';
import { TaskConversation } from './conversation/task-conversation.tsx';
import { TaskHistoryDetails } from './details/task-history-details.tsx';
import { overviewTab, TaskSidePane } from './task-side-pane.tsx';
import { TaskWorkPanel } from './work/task-work-panel.tsx';

export { TaskBandControls } from './task-band-controls.tsx';

export function TaskPage({ panelShown, taskKey }: { panelShown: boolean; taskKey: string }) {
    const { server } = useServerContext();
    const task = useTask(server.id, { key: taskKey });

    if (task.error?.data?.code === 'NOT_FOUND') {
        return <TaskUnavailable title="Task not found" />;
    }
    if (task.data) {
        return task.data.chatId ? (
            <TaskDetailView
                chatId={task.data.chatId}
                key={task.data.id}
                panelShown={panelShown}
                task={task.data}
            />
        ) : (
            <TaskHistoryView key={task.data.id} task={task.data} />
        );
    }
    return task.error ? <TaskUnavailable title="Task unavailable" /> : null;
}

function TaskDetailView({
    chatId,
    panelShown,
    task,
}: {
    chatId: string;
    panelShown: boolean;
    task: TaskDetail;
}) {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { server } = useServerContext();
    const openWorkerIds = params.getAll('worker');
    const selected = panelShown ? (params.get('tab') ?? overviewTab) : overviewTab;
    const openWorker = React.useCallback(
        (workerId: string) => {
            if (panelShown) {
                setParams((current) => withTab(withWorkerOpen(current, workerId), workerId));
            } else {
                navigate(workerRoute(server.slug, workerId));
            }
        },
        [navigate, panelShown, server.slug, setParams]
    );
    const workerWide = selected !== overviewTab;

    return (
        <WorkerSummariesProvider workers={task.attachedWork}>
            <WorkerOpenContext value={openWorker}>
                <div
                    className={
                        panelShown
                            ? cn(
                                  'grid min-h-0 flex-1 gap-6 pe-5',
                                  workerWide
                                      ? 'grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]'
                                      : 'grid-cols-[minmax(0,1fr)_18rem]'
                              )
                            : 'flex min-h-0 flex-1'
                    }
                >
                    <TaskConversation
                        chatId={chatId}
                        origin={task.origin}
                        title={`${task.key} ${task.title}`}
                    />
                    {panelShown ? (
                        <TaskSidePane
                            onClose={(workerId) =>
                                setParams((current) =>
                                    withTab(withWorkerClosed(current, workerId), overviewTab)
                                )
                            }
                            onSelect={(tab) => setParams((current) => withTab(current, tab))}
                            openWorkerIds={openWorkerIds}
                            selected={selected}
                            task={task}
                        />
                    ) : null}
                </div>
            </WorkerOpenContext>
        </WorkerSummariesProvider>
    );
}

function withWorkerOpen(params: URLSearchParams, workerId: string) {
    const next = new URLSearchParams(params);
    if (!next.getAll('worker').includes(workerId)) {
        next.append('worker', workerId);
    }
    return next;
}

function withWorkerClosed(params: URLSearchParams, workerId: string) {
    const next = new URLSearchParams(params);
    const rest = next.getAll('worker').filter((id) => id !== workerId);
    next.delete('worker');
    for (const id of rest) {
        next.append('worker', id);
    }
    return next;
}

function withTab(params: URLSearchParams, tab: string) {
    const next = new URLSearchParams(params);
    if (tab === overviewTab) {
        next.delete('tab');
    } else {
        next.set('tab', tab);
    }
    return next;
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
