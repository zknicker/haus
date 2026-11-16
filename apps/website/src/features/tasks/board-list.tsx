import type { Board, Task } from '@haus/api';
import { Button } from '@heroui/react';
import { EmptyState, ItemCardGroup, ListView } from '@heroui-pro/react';
import { Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { type BoardColumnGroup, visibleColumnTasks } from './board-view.ts';
import { ColumnCategoryDisc } from './column-category-disc.tsx';
import { TaskContextMenu } from './task-context-menu.tsx';
import { TaskAssigneeMark, TaskDueDate, TaskLabelChips, TaskWorkingMark } from './task-facts.tsx';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import { useOpenTask } from './use-open-task.ts';

/** The List lens: the same columns as sections, the rows dense enough to scan a long board. */
export function BoardList({
    board,
    filtered,
    groups,
}: {
    board: Board;
    /** A filter is on, so an empty result means no match rather than no Tasks. */
    filtered: boolean;
    groups: readonly BoardColumnGroup[];
}) {
    const populated = groups.filter((group) => group.tasks.length > 0);
    if (populated.length === 0) {
        return (
            <EmptyState className="flex-1">
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon aria-hidden="true" icon={Task01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>
                        {filtered ? 'No matching tasks' : 'No tasks yet'}
                    </EmptyState.Title>
                </EmptyState.Header>
            </EmptyState>
        );
    }
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-8">
            {populated.map((group) => (
                <BoardListSection board={board} group={group} key={group.column.id} />
            ))}
        </div>
    );
}

function BoardListSection({ board, group }: { board: Board; group: BoardColumnGroup }) {
    const openTask = useOpenTask();
    const [expanded, setExpanded] = React.useState(false);
    const { hidden, tasks } = visibleColumnTasks(group, expanded);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title className="flex items-center gap-2">
                    <ColumnCategoryDisc category={group.column.category} />
                    {group.column.name}
                    <span className="text-muted tabular-nums">{group.tasks.length}</span>
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ListView
                aria-label={`${group.column.name} tasks`}
                // Rows cache by Task, and each menu lists the board's columns.
                dependencies={[board.columns]}
                items={tasks}
                onAction={(key) => {
                    const task = tasks.find((candidate) => candidate.id === key);
                    if (task) {
                        openTask(task);
                    }
                }}
                variant="secondary"
            >
                {(task) => (
                    <ListView.Item id={task.id} textValue={task.title}>
                        <TaskContextMenu
                            columns={board.columns}
                            onOpen={() => openTask(task)}
                            task={task}
                        >
                            <TaskListRow task={task} />
                        </TaskContextMenu>
                    </ListView.Item>
                )}
            </ListView>
            {hidden > 0 ? (
                <Button onPress={() => setExpanded(true)} size="sm" variant="ghost">
                    {`Show ${hidden} more`}
                </Button>
            ) : null}
        </ItemCardGroup>
    );
}

function TaskListRow({ task }: { task: Task }) {
    return (
        <ListView.ItemContent>
            <TaskPriorityIcon className="text-muted" priority={task.priority} />
            <span className="w-16 shrink-0 text-muted text-sm tabular-nums">{task.key}</span>
            <ListView.Title className="min-w-0 flex-1">{task.title}</ListView.Title>
            <TaskWorkingMark task={task} />
            <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
                <TaskLabelChips labelIds={task.labelIds} />
            </span>
            <TaskDueDate task={task} />
            <TaskAssigneeMark assignee={task.assignee} />
        </ListView.ItemContent>
    );
}
