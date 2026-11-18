import type { Task, TaskState } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Label, ListBox } from '@heroui/react';
import { EntityName } from '../../components/ui/entity-name.tsx';
import { useAssignTask } from '../../hooks/tasks/use-assign-task.ts';
import { useSetTaskState } from '../../hooks/tasks/use-set-task-state.ts';
import { assigneeFromKey, assigneeKey, unassignedKey } from './task-assignee.ts';
import { PersonListBox } from './task-pickers.tsx';
import { TaskStateDisc } from './task-state-disc.tsx';
import { isTaskState, taskStateLabels, taskStateOrder } from './task-state.ts';
import { showTaskUpdateError } from './task-update-error.ts';
import { useTaskActor, useTaskPeople } from './use-task-people.ts';

type TaskVersion = Pick<Task, 'assignee' | 'id' | 'serverId' | 'state' | 'version'>;

export function TaskStateSelect({ task }: { task: TaskVersion }) {
    const setState = useSetTaskState();
    return (
        <InlineSelect
            aria-label="State"
            onChange={(next) => {
                if (isTaskState(next) && next !== task.state) {
                    changeTaskState(setState.mutate, task, next);
                }
            }}
            value={task.state}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <TaskStateDisc state={task.state} />
                <span className="truncate text-sm">{taskStateLabels[task.state]}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44" placement="bottom start">
                <TaskStateListBox />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

export function TaskAssigneeSelect({ task }: { task: TaskVersion }) {
    const assign = useAssignTask();
    const people = useTaskPeople(task.serverId);
    const current = useTaskActor(task.serverId, task.assignee);

    return (
        <InlineSelect
            aria-label="Assignee"
            onChange={(next) => {
                const key = String(next);
                if (next !== null && key !== assigneeKey(task.assignee)) {
                    assign.mutate(
                        {
                            assignee: assigneeFromKey(key),
                            expectedVersion: task.version,
                            serverId: task.serverId,
                            taskId: task.id,
                        },
                        { onError: showTaskUpdateError }
                    );
                }
            }}
            value={assigneeKey(task.assignee)}
        >
            <InlineSelect.Trigger className="gap-1.5">
                {current ? (
                    <EntityName
                        avatarUrl={current.avatarUrl}
                        className="text-sm"
                        name={current.label}
                        size={18}
                    />
                ) : (
                    <span className="truncate text-sm">Unassigned</span>
                )}
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-64" placement="bottom start">
                <PersonListBox
                    leading={[{ id: unassignedKey, label: 'Unassigned' }]}
                    people={people}
                />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

export function TaskStateListBox() {
    return (
        <ListBox>
            {taskStateOrder.map((state) => (
                <ListBox.Item id={state} key={state} textValue={taskStateLabels[state]}>
                    <TaskStateDisc state={state} />
                    <Label>{taskStateLabels[state]}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}

export function changeTaskState(
    mutate: ReturnType<typeof useSetTaskState>['mutate'],
    task: Pick<Task, 'id' | 'serverId' | 'version'>,
    state: TaskState
) {
    mutate(
        { expectedVersion: task.version, serverId: task.serverId, state, taskId: task.id },
        { onError: showTaskUpdateError }
    );
}
