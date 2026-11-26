import type { Task } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Label, ListBox } from '@heroui/react';
import { useArchiveTask } from '../../hooks/tasks/use-archive-task.ts';
import { useUnarchiveTask } from '../../hooks/tasks/use-unarchive-task.ts';
import { TaskStateDisc } from './task-state-disc.tsx';
import {
    isTaskState,
    type TaskState,
    taskStateLabels,
    taskStateOf,
    taskStateOrder,
} from './task-state.ts';
import { showTaskUpdateError } from './task-update-error.ts';

type TaskVersion = Pick<Task, 'archivedAt' | 'id' | 'serverId' | 'version'>;

export function TaskStateSelect({ task }: { task: TaskVersion }) {
    const changeState = useChangeTaskState();
    const state = taskStateOf(task);
    return (
        <InlineSelect
            aria-label="State"
            onChange={(next) => {
                if (isTaskState(next) && next !== state) {
                    changeState(task, next);
                }
            }}
            value={state}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <TaskStateDisc state={state} />
                <span className="truncate text-sm">{taskStateLabels[state]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44" placement="bottom end">
                <ListBox>
                    {taskStateOrder.map((option) => (
                        <ListBox.Item id={option} key={option} textValue={taskStateLabels[option]}>
                            <TaskStateDisc state={option} />
                            <Label>{taskStateLabels[option]}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

export function useChangeTaskState() {
    const archive = useArchiveTask();
    const unarchive = useUnarchiveTask();
    return (task: Pick<Task, 'id' | 'serverId' | 'version'>, state: TaskState) => {
        const mutation = state === 'archived' ? archive : unarchive;
        mutation.mutate(
            { expectedVersion: task.version, serverId: task.serverId, taskId: task.id },
            { onError: showTaskUpdateError }
        );
    };
}
