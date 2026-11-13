import type { Board, TaskDetail } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import type * as React from 'react';
import { Link } from 'react-router-dom';
import { RelativeTime } from '../../components/time/relative-time.tsx';
import { EntityName } from '../../components/ui/entity-name.tsx';
import { useBoards } from '../../hooks/boards/use-boards.ts';
import { useAssignTask } from '../../hooks/tasks/use-assign-task.ts';
import { useUpdateTask } from '../../hooks/tasks/use-update-task.ts';
import { useServerContext } from '../servers/server-context.ts';
import { boardRoute } from '../servers/server-routes.ts';
import { assigneeFromKey, assigneeKey, unassignedKey } from './board-view.ts';
import { ColumnCategoryDisc } from './column-category-disc.tsx';
import { TaskDuePicker } from './task-due-picker.tsx';
import { TaskLabelsPicker } from './task-labels-picker.tsx';
import { ColumnListBox, isTaskPriority, PersonListBox, PriorityListBox } from './task-pickers.tsx';
import { taskPriorityLabels } from './task-presentation.ts';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import { showTaskUpdateError } from './task-update-error.ts';
import { useMoveTaskAction } from './use-move-task-action.ts';
import { useTaskActor, useTaskPeople } from './use-task-people.ts';

/** The Task's rail: what can change, each fact its own control, then what cannot. */
export function TaskProperties({ task }: { task: TaskDetail }) {
    const { server } = useServerContext();
    const boards = useBoards(server.id).data;
    const board = boards?.find((candidate) => candidate.id === task.boardId);

    return (
        <dl aria-label="Task properties" className="flex min-w-0 flex-col">
            <TaskFact label="Status">
                <StatusPicker board={board} task={task} />
            </TaskFact>
            <TaskFact label="Assignee">
                <AssigneePicker task={task} />
            </TaskFact>
            <TaskFact label="Priority">
                <PriorityPicker task={task} />
            </TaskFact>
            <TaskFact label="Labels">
                <TaskLabelsPicker task={task} />
            </TaskFact>
            <TaskFact label="Due">
                <TaskDuePicker task={task} />
            </TaskFact>
            <TaskFact label="Board">
                {board ? (
                    <Link className="truncate ps-1" to={boardRoute(server.slug, board.key)}>
                        {board.name}
                    </Link>
                ) : (
                    <span className="ps-1 text-muted">Archived</span>
                )}
            </TaskFact>
            <TaskFact label="Created">
                <TaskCreated task={task} />
            </TaskFact>
            <TaskFact label="Updated">
                <span className="ps-1 text-muted">
                    <RelativeTime value={task.updatedAt} />
                </span>
            </TaskFact>
        </dl>
    );
}

function TaskFact({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="grid min-h-8 grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="flex min-w-0 items-center">{children}</dd>
        </div>
    );
}

function StatusPicker({ board, task }: { board: Board | undefined; task: TaskDetail }) {
    const moveTask = useMoveTaskAction();
    const column = board?.columns.find((candidate) => candidate.id === task.columnId);

    return (
        <InlineSelect
            aria-label="Status"
            isDisabled={!board}
            onChange={(next) => next && moveTask(task, String(next))}
            value={task.columnId}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <ColumnCategoryDisc category={task.category} />
                <span className="truncate text-sm">{column?.name ?? task.category}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-56" placement="bottom start">
                <ColumnListBox columns={board?.columns ?? []} />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}

function AssigneePicker({ task }: { task: TaskDetail }) {
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

function PriorityPicker({ task }: { task: TaskDetail }) {
    const update = useUpdateTask();

    return (
        <InlineSelect
            aria-label="Priority"
            onChange={(next) => {
                if (isTaskPriority(next) && next !== task.priority) {
                    update.mutate(
                        {
                            expectedVersion: task.version,
                            patch: { priority: next },
                            serverId: task.serverId,
                            taskId: task.id,
                        },
                        { onError: showTaskUpdateError }
                    );
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

function TaskCreated({ task }: { task: TaskDetail }) {
    const creator = useTaskActor(task.serverId, task.createdBy);
    return (
        <span className="truncate ps-1 text-muted">
            {creator?.label}
            {' · '}
            <RelativeTime value={task.createdAt} />
        </span>
    );
}
