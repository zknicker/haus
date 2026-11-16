import type { Board, Task } from '@haus/api';
import { Kanban, useKanbanCardPlaceholder } from '@heroui-pro/react';
import * as React from 'react';
import { BoardColumn } from './board-column.tsx';
import { activeOverloadsByColumn, type BoardColumnGroup } from './board-view.ts';
import { useMoveTaskAction } from './use-move-task-action.ts';
import { useOpenTask } from './use-open-task.ts';

const noOverloads: never[] = [];

/** The Board lens: every column left to right, on the stock Kanban. */
export function BoardCanvas({
    allTasks,
    board,
    groups,
}: {
    /** The board's whole list, unfiltered: a warning reads what is true, not what is shown. */
    allTasks: readonly Task[];
    board: Board;
    groups: readonly BoardColumnGroup[];
}) {
    const openTask = useOpenTask();
    const moveTask = useMoveTaskAction();
    const overloads = React.useMemo(
        () => activeOverloadsByColumn(board, allTasks),
        [allTasks, board]
    );
    const { renderDropIndicator } = useKanbanCardPlaceholder({
        renderIndicator: (target) => <Kanban.DropIndicator target={target} />,
    });
    const onMove = (taskId: string, columnId: string) => {
        const task = allTasks.find((candidate) => candidate.id === taskId);
        if (task) {
            moveTask(task, columnId);
        }
    };

    return (
        <Kanban className="min-h-0 flex-1 px-4 pb-4">
            {groups.map((group) => (
                <BoardColumn
                    board={board}
                    group={group}
                    key={group.column.id}
                    onMove={onMove}
                    onOpen={openTask}
                    overloads={overloads.get(group.column.id) ?? noOverloads}
                    renderDropIndicator={renderDropIndicator}
                />
            ))}
        </Kanban>
    );
}
