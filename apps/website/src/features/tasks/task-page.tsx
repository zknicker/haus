import type { TaskDetail } from '@haus/api';
import { Button } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon, Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { useServerContext } from '../servers/server-context.ts';
import { tasksRoute } from '../servers/server-routes.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { TaskConversation } from './conversation/task-conversation.tsx';
import { TaskDetailsCard } from './details/task-details-card.tsx';
import { TaskHistoryDetails } from './details/task-history-details.tsx';
import { TaskWorkPanel } from './work/task-work-panel.tsx';

export { TaskBandControls } from './task-band-controls.tsx';

/**
 * One Task as a page (ADR 0053 decision 12): its conversation on the left and,
 * on a pane wide enough, a right-hand panel of its Details and attached work,
 * on the page background with a gutter and no dividing border. Narrower, the
 * band's Details control carries the Details. A Task from before Tasks were
 * places has no conversation and reads as history. A re-keyed or mistyped
 * address answers NOT_FOUND; the check reads the error first because a
 * background refetch keeps the last good record beside it. Blank while the
 * Task loads.
 */
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
    return (
        <div
            className={
                panelShown
                    ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem] gap-8 pe-5'
                    : 'flex min-h-0 flex-1'
            }
        >
            <TaskConversation
                chatId={chatId}
                origin={task.origin}
                title={`${task.key} ${task.title}`}
            />
            {panelShown ? (
                <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pt-4 pb-6">
                    <TaskDetailsCard task={task} />
                    <TaskWorkPanel task={task} />
                </div>
            ) : null}
        </div>
    );
}

/** A chatless Task: its record, read-only, in one column. No composer, nothing to come. */
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
