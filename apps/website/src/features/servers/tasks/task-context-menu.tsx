import { Label, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    CircleArrowUpRightIcon,
    CopyLinkIcon,
    Navigation03Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useTaskAssign } from '../../../hooks/servers/use-task-assign.ts';
import { useTaskAssignees } from '../../../hooks/servers/use-task-assignees.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { useTaskUpdate } from '../../../hooks/servers/use-task-update.ts';
import { writeClipboardText } from '../../../lib/clipboard.ts';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute, tasksRoute } from '../server-routes.ts';
import { taskAssigneeFromKey } from './task-assignee.tsx';
import {
    TaskAssigneeSubmenu,
    TaskLabelSubmenu,
    TaskPrioritySubmenu,
    TaskStatusSubmenu,
    taskAssigneeActionPrefix,
    taskLabelActionPrefix,
    taskPriorityActionPrefix,
    taskStatusActionPrefix,
} from './task-context-submenus.tsx';
import { taskAssignmentInput, taskUpdateInput, toggledTaskLabelIds } from './task-input.ts';
import type { TaskItem } from './task-model.ts';

export function TaskContextMenu({
    children,
    onOpenTask,
    task,
}: {
    children: React.ReactNode;
    onOpenTask: (task: TaskItem) => void;
    task: TaskItem;
}) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const [open, setOpen] = React.useState(false);
    const assignees = useTaskAssignees(server.id, task.id, open);
    const labels = useTaskLabels(server.id, { enabled: open });
    const assign = useTaskAssign();
    const update = useTaskUpdate();
    const pending = assign.isPending || update.isPending;

    const onAction = (key: React.Key) => {
        const action = String(key);
        if (action === 'open') {
            onOpenTask(task);
            return;
        }
        if (action === 'view-chat') {
            navigate(serverChatRoute(server.slug, task.chatId));
            return;
        }
        if (action === 'copy-link') {
            const route = `${tasksRoute(server.slug)}?task=${encodeURIComponent(task.id)}`;
            writeClipboardText(new URL(route, window.location.origin).toString())
                .then(() => toast.success('Task link copied'))
                .catch(() => toast.danger('Could not copy the task link'));
            return;
        }
        if (action.startsWith(taskStatusActionPrefix)) {
            update.mutate(
                taskUpdateInput(server.id, task, {
                    status: action.slice(taskStatusActionPrefix.length) as TaskItem['status'],
                }),
                { onError: showTaskMutationError }
            );
            return;
        }
        if (action.startsWith(taskPriorityActionPrefix)) {
            update.mutate(
                taskUpdateInput(server.id, task, {
                    priority: action.slice(taskPriorityActionPrefix.length) as TaskItem['priority'],
                }),
                { onError: showTaskMutationError }
            );
            return;
        }
        if (action.startsWith(taskAssigneeActionPrefix)) {
            assign.mutate(
                taskAssignmentInput(
                    server.id,
                    task,
                    taskAssigneeFromKey(action.slice(taskAssigneeActionPrefix.length))
                ),
                { onError: showTaskMutationError }
            );
            return;
        }
        if (action.startsWith(taskLabelActionPrefix)) {
            const labelId = action.slice(taskLabelActionPrefix.length);
            const currentIds = task.labels.map((label) => label.id);
            update.mutate(
                taskUpdateInput(server.id, task, {
                    labelIds: toggledTaskLabelIds(
                        currentIds,
                        labelId,
                        !currentIds.includes(labelId)
                    ),
                }),
                { onError: showTaskMutationError }
            );
        }
    };

    return (
        <ContextMenu onOpenChange={setOpen} open={open}>
            <ContextMenu.Trigger className="block min-w-0">{children}</ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item id="open" textValue="Open task">
                        <Icon aria-hidden="true" icon={CircleArrowUpRightIcon} size={16} />
                        <Label>Open task</Label>
                    </ContextMenu.Item>
                    <TaskStatusSubmenu disabled={pending} onAction={onAction} task={task} />
                    <TaskPrioritySubmenu disabled={pending} onAction={onAction} task={task} />
                    <TaskAssigneeSubmenu
                        assignees={assignees.data ?? []}
                        disabled={pending || assignees.isPending}
                        onAction={onAction}
                        task={task}
                    />
                    <TaskLabelSubmenu
                        disabled={pending || labels.isPending}
                        labels={labels.data ?? []}
                        onAction={onAction}
                        task={task}
                    />
                    <ContextMenu.Separator />
                    <ContextMenu.Item id="view-chat" textValue="View in chat">
                        <Icon aria-hidden="true" icon={Navigation03Icon} size={16} />
                        <Label>View in chat</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="copy-link" textValue="Copy task link">
                        <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                        <Label>Copy task link</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function showTaskMutationError(error: { message: string }) {
    toast.danger('Task update failed', { description: error.message });
}
