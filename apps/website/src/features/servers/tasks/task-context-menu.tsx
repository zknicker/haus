import { Label, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    CircleArrowUpRightIcon,
    CopyLinkIcon,
    Navigation03Icon,
    UserCheck01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTaskAssign } from '../../../hooks/servers/use-task-assign.ts';
import { useTaskAssignees } from '../../../hooks/servers/use-task-assignees.ts';
import { useTaskClaim } from '../../../hooks/servers/use-task-claim.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { useTaskUnclaim } from '../../../hooks/servers/use-task-unclaim.ts';
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
import { type TaskItem, taskClaimAction } from './task-model.ts';

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
    const humans = useHumanDirectory(server.id);
    const [open, setOpen] = React.useState(false);
    const assignees = useTaskAssignees(server.id, task.id, open);
    const labels = useTaskLabels(server.id, { enabled: open });
    const assign = useTaskAssign();
    const update = useTaskUpdate();
    const claim = useTaskClaim();
    const unclaim = useTaskUnclaim();
    const claimAction = taskClaimAction(task, server.viewerUserId);
    const pending = assign.isPending || update.isPending || claim.isPending || unclaim.isPending;

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
        if (action === 'claim' || action === 'unclaim') {
            const mutation = action === 'claim' ? claim : unclaim;
            mutation.mutate(
                {
                    expectedVersion: task.version,
                    messageId: task.id,
                    serverId: server.id,
                },
                { onError: showTaskMutationError }
            );
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
                        humans={humans}
                        onAction={onAction}
                        task={task}
                    />
                    <TaskLabelSubmenu
                        disabled={pending || labels.isPending}
                        labels={labels.data ?? []}
                        onAction={onAction}
                        task={task}
                    />
                    {claimAction ? (
                        <ContextMenu.Item
                            id={claimAction === 'unclaim' ? 'unclaim' : 'claim'}
                            isDisabled={pending}
                            textValue={claimAction === 'unclaim' ? 'Unclaim task' : 'Claim task'}
                        >
                            <Icon aria-hidden="true" icon={UserCheck01Icon} size={16} />
                            <Label>
                                {claimAction === 'unclaim' ? 'Unclaim task' : 'Claim task'}
                            </Label>
                        </ContextMenu.Item>
                    ) : null}
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
