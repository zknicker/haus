import type { TaskAssignee, TaskLabel } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    Flag02Icon,
    Tag01Icon,
    TaskDone01Icon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import {
    taskPriorityLabels,
    taskPriorityOrder,
    taskStatusLabels,
    taskStatusOrder,
} from '../../tasks/task-presentation.ts';
import { TaskPriorityIcon } from '../../tasks/task-priority-icon.tsx';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';
import { unassignedAssigneeKey } from './task-assignee.tsx';
import type { TaskItem } from './task-model.ts';

interface TaskSubmenuProps {
    disabled: boolean;
    onAction: (key: React.Key) => void;
    task: TaskItem;
}

export function TaskStatusSubmenu({ disabled, onAction, task }: TaskSubmenuProps) {
    return (
        <ContextMenu.SubmenuTrigger>
            <ContextMenu.Item id="status" isDisabled={disabled} textValue="Status">
                <Icon aria-hidden="true" icon={TaskDone01Icon} size={16} />
                <Label>Status</Label>
                <ContextMenu.SubmenuIndicator />
            </ContextMenu.Item>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    {taskStatusOrder.map((status) => (
                        <ContextMenu.Item
                            id={`${taskStatusActionPrefix}${status}`}
                            key={status}
                            textValue={taskStatusLabels[status]}
                        >
                            <TaskStatusDisc className="size-4" status={status} />
                            <Label>{taskStatusLabels[status]}</Label>
                            {status === task.status ? <ContextMenu.ItemIndicator /> : null}
                        </ContextMenu.Item>
                    ))}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu.SubmenuTrigger>
    );
}

export function TaskPrioritySubmenu({ disabled, onAction, task }: TaskSubmenuProps) {
    return (
        <ContextMenu.SubmenuTrigger>
            <ContextMenu.Item id="priority" isDisabled={disabled} textValue="Priority">
                <Icon aria-hidden="true" icon={Flag02Icon} size={16} />
                <Label>Priority</Label>
                <ContextMenu.SubmenuIndicator />
            </ContextMenu.Item>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    {taskPriorityOrder.map((priority) => (
                        <ContextMenu.Item
                            id={`${taskPriorityActionPrefix}${priority}`}
                            key={priority}
                            textValue={taskPriorityLabels[priority]}
                        >
                            <TaskPriorityIcon className="size-4" priority={priority} />
                            <Label>{taskPriorityLabels[priority]}</Label>
                            {priority === task.priority ? <ContextMenu.ItemIndicator /> : null}
                        </ContextMenu.Item>
                    ))}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu.SubmenuTrigger>
    );
}

export function TaskAssigneeSubmenu({
    assignees,
    disabled,
    onAction,
    task,
}: TaskSubmenuProps & {
    assignees: TaskAssignee[];
}) {
    const selectedKey = task.assigneeAgentId ?? unassignedAssigneeKey;

    return (
        <ContextMenu.SubmenuTrigger>
            <ContextMenu.Item id="assignee" isDisabled={disabled} textValue="Assign">
                <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                <Label>Assign</Label>
                <ContextMenu.SubmenuIndicator />
            </ContextMenu.Item>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item
                        id={`${taskAssigneeActionPrefix}${unassignedAssigneeKey}`}
                        textValue="Unassigned"
                    >
                        <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                        <Label>Unassigned</Label>
                        {selectedKey === unassignedAssigneeKey ? (
                            <ContextMenu.ItemIndicator />
                        ) : null}
                    </ContextMenu.Item>
                    {assignees.map((assignee) => (
                        <ContextMenu.Item
                            id={`${taskAssigneeActionPrefix}${assignee.agentId}`}
                            key={assignee.agentId}
                            textValue={assignee.displayName}
                        >
                            <Icon aria-hidden="true" icon={UserCircleIcon} size={16} />
                            <Label>{assignee.displayName}</Label>
                            {selectedKey === assignee.agentId ? (
                                <ContextMenu.ItemIndicator />
                            ) : null}
                        </ContextMenu.Item>
                    ))}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu.SubmenuTrigger>
    );
}

export function TaskLabelSubmenu({
    disabled,
    labels,
    onAction,
    task,
}: TaskSubmenuProps & { labels: TaskLabel[] }) {
    const selected = new Set(task.labels.map((label) => label.id));
    return (
        <ContextMenu.SubmenuTrigger>
            <ContextMenu.Item
                id="labels"
                isDisabled={disabled || labels.length === 0}
                textValue="Labels"
            >
                <Icon aria-hidden="true" icon={Tag01Icon} size={16} />
                <Label>Labels</Label>
                <ContextMenu.SubmenuIndicator />
            </ContextMenu.Item>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    {labels.map((label) => (
                        <ContextMenu.Item
                            id={`${taskLabelActionPrefix}${label.id}`}
                            key={label.id}
                            textValue={label.name}
                        >
                            <Icon aria-hidden="true" icon={Tag01Icon} size={16} />
                            <Label>{label.name}</Label>
                            {selected.has(label.id) ? <ContextMenu.ItemIndicator /> : null}
                        </ContextMenu.Item>
                    ))}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu.SubmenuTrigger>
    );
}

export const taskStatusActionPrefix = 'status:';
export const taskPriorityActionPrefix = 'priority:';
export const taskAssigneeActionPrefix = 'assignee:';
export const taskLabelActionPrefix = 'label:';
