import type { Board, Task } from '@haus/api';
import { Button } from '@heroui/react';
import { Kanban } from '@heroui-pro/react';
import * as React from 'react';
import { useAgentMark } from '../../hooks/members/use-agents.ts';
import { useServerContext } from '../servers/server-context.ts';
import { type ActiveOverload, type BoardColumnGroup, visibleColumnTasks } from './board-view.ts';
import { ColumnCategoryDisc } from './column-category-disc.tsx';
import { NewTaskButton } from './new-task-dialog.tsx';
import { TaskCard } from './task-card.tsx';
import { TaskContextMenu } from './task-context-menu.tsx';
import { useColumnDrop } from './use-column-drop.ts';

/** One board column: its header, any warning, and its cards. */
export function BoardColumn({
    board,
    group,
    onMove,
    onOpen,
    overloads,
    renderDropIndicator,
}: {
    board: Board;
    group: BoardColumnGroup;
    onMove: (taskId: string, columnId: string) => void;
    onOpen: (task: Task) => void;
    overloads: readonly ActiveOverload[];
    renderDropIndicator: Parameters<typeof useColumnDrop>[0]['renderDropIndicator'];
}) {
    const { column } = group;
    const [expanded, setExpanded] = React.useState(false);
    const { hidden, tasks } = visibleColumnTasks(group, expanded);
    const dragAndDropHooks = useColumnDrop({
        onDrop: (taskId) => onMove(taskId, column.id),
        renderDropIndicator,
    });

    return (
        <Kanban.Column aria-label={column.name} className="min-h-0">
            <Kanban.ColumnHeader>
                <Kanban.ColumnIndicator>
                    <ColumnCategoryDisc category={column.category} />
                </Kanban.ColumnIndicator>
                <Kanban.ColumnTitle>{column.name}</Kanban.ColumnTitle>
                <Kanban.ColumnCount>{group.tasks.length}</Kanban.ColumnCount>
                <Kanban.ColumnActions>
                    <NewTaskButton board={board} column={column} />
                </Kanban.ColumnActions>
            </Kanban.ColumnHeader>
            {overloads.map((overload) => (
                <ActiveOverloadWarning key={overload.agentId} overload={overload} />
            ))}
            <Kanban.ColumnBody className="min-h-0">
                <Kanban.ScrollShadow className="min-h-0 overflow-y-auto">
                    <Kanban.CardList
                        aria-label={`${column.name} tasks`}
                        // Cards cache by Task, and each menu lists the board's columns.
                        dependencies={[board.columns]}
                        dragAndDropHooks={dragAndDropHooks}
                        items={tasks}
                    >
                        {(task) => (
                            <Kanban.Card
                                id={task.id}
                                onAction={() => onOpen(task)}
                                textValue={task.title}
                            >
                                <TaskContextMenu
                                    columns={board.columns}
                                    onOpen={() => onOpen(task)}
                                    task={task}
                                >
                                    <TaskCard task={task} />
                                </TaskContextMenu>
                            </Kanban.Card>
                        )}
                    </Kanban.CardList>
                    {hidden > 0 ? (
                        <Button
                            fullWidth
                            onPress={() => setExpanded(true)}
                            size="sm"
                            variant="ghost"
                        >
                            {`Show ${hidden} more`}
                        </Button>
                    ) : null}
                </Kanban.ScrollShadow>
            </Kanban.ColumnBody>
        </Kanban.Column>
    );
}

/** An Agent works one Task at a time; the Server allows a second, and the column says so. */
function ActiveOverloadWarning({ overload }: { overload: ActiveOverload }) {
    const { server } = useServerContext();
    const agent = useAgentMark(server.id, overload.agentId);
    return (
        <p className="flex items-center gap-1.5 px-1 text-sm text-warning-soft-foreground">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
            {`${agent?.displayName ?? 'An Agent'} holds ${overload.count} active tasks`}
        </p>
    );
}
