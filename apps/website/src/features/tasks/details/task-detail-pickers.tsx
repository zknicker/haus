import type { Task } from '@haus/api';
import { Button, Calendar, DatePicker, Label, ListBox } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { parseDate } from '@internationalized/date';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { useUpdateTask } from '../../../hooks/tasks/use-update-task.ts';
import { LabelDot } from '../label-chip.tsx';
import { formatDueOn, TaskLabelChips } from '../task-facts.tsx';
import { isTaskPriority, PriorityListBox } from '../task-pickers.tsx';
import { taskPriorityLabels } from '../task-presentation.ts';
import { TaskPriorityIcon } from '../task-priority-icon.tsx';
import { showTaskUpdateError } from '../task-update-error.ts';

type TaskFields = Pick<Task, 'dueOn' | 'id' | 'labelIds' | 'priority' | 'serverId' | 'version'>;
interface TaskPatch {
    dueOn?: null | string;
    labelIds?: string[];
    priority?: Task['priority'];
}

export function TaskPrioritySelect({ task }: { task: TaskFields }) {
    const patch = useTaskPatch(task);
    return (
        <InlineSelect
            aria-label="Priority"
            onChange={(next) => {
                if (isTaskPriority(next) && next !== task.priority) {
                    patch({ priority: next });
                }
            }}
            value={task.priority}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <TaskPriorityIcon className="text-muted" priority={task.priority} />
                <span className="truncate text-sm">{taskPriorityLabels[task.priority]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44" placement="bottom start">
                <PriorityListBox />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

export function TaskDuePicker({ task }: { task: TaskFields }) {
    const patch = useTaskPatch(task);
    return (
        <span className="flex min-w-0 items-center gap-1">
            <DatePicker
                aria-label="Due date"
                onChange={(value) => value && patch({ dueOn: value.toString() })}
                value={task.dueOn ? parseDate(task.dueOn) : null}
            >
                <DatePicker.Trigger>
                    <span className={task.dueOn ? 'text-sm' : 'text-muted text-sm'}>
                        {task.dueOn ? formatDueOn(task.dueOn) : 'No due date'}
                    </span>
                </DatePicker.Trigger>
                <DatePicker.Popover>
                    <Calendar aria-label="Due date">
                        <Calendar.Header>
                            <Calendar.Heading />
                            <Calendar.NavButton slot="previous" />
                            <Calendar.NavButton slot="next" />
                        </Calendar.Header>
                        <Calendar.Grid>
                            <Calendar.GridHeader>
                                {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                            </Calendar.GridHeader>
                            <Calendar.GridBody>
                                {(date) => <Calendar.Cell date={date} />}
                            </Calendar.GridBody>
                        </Calendar.Grid>
                    </Calendar>
                </DatePicker.Popover>
            </DatePicker>
            {task.dueOn ? (
                <Button
                    aria-label="Clear due date"
                    isIconOnly
                    onPress={() => patch({ dueOn: null })}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                </Button>
            ) : null}
        </span>
    );
}

export function TaskLabelsPicker({ task }: { task: TaskFields }) {
    const labels = useTaskLabels(task.serverId).data ?? [];
    const patch = useTaskPatch(task);

    return (
        <InlineSelect
            aria-label="Labels"
            isDisabled={labels.length === 0}
            onChange={(keys) => patch({ labelIds: (keys as React.Key[]).map(String) })}
            selectionMode="multiple"
            value={task.labelIds}
        >
            <InlineSelect.Trigger className="h-auto gap-1.5">
                {task.labelIds.length > 0 ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-1">
                        <TaskLabelChips labelIds={task.labelIds} />
                    </span>
                ) : (
                    <span className="truncate text-muted text-sm">
                        {labels.length === 0 ? 'No labels yet' : 'Add labels'}
                    </span>
                )}
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ListBox selectionMode="multiple">
                    {labels.map((label) => (
                        <ListBox.Item id={label.id} key={label.id} textValue={label.name}>
                            <LabelDot color={label.color} />
                            <Label>{label.name}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function useTaskPatch(task: TaskFields) {
    const update = useUpdateTask();
    return (patch: TaskPatch) =>
        update.mutate(
            {
                expectedVersion: task.version,
                patch,
                serverId: task.serverId,
                taskId: task.id,
            },
            { onError: showTaskUpdateError }
        );
}
