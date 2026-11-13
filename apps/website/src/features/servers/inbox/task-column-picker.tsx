import type { Board, BoardColumn, Task } from '@haus/api';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { ColumnCategoryDisc } from '../../tasks/column-category-disc.tsx';
import { ColumnListBox } from '../../tasks/task-pickers.tsx';

/**
 * A Task card's status: the Task's column, and the picker that reaches any
 * other. Choosing a column resolves the card like Start or Done does.
 */
export function TaskColumnPicker({
    board,
    onMove,
    task,
}: {
    board: Pick<Board, 'columns'>;
    onMove: (column: BoardColumn) => void;
    task: Pick<Task, 'category' | 'columnId' | 'key'>;
}) {
    const current = board.columns.find((column) => column.id === task.columnId);
    const onChange = (value: unknown) => {
        const column = board.columns.find((candidate) => candidate.id === value);
        if (column && column.id !== task.columnId) {
            onMove(column);
        }
    };

    return (
        <InlineSelect
            aria-label={`Status of ${task.key}`}
            onChange={onChange}
            value={task.columnId}
        >
            <InlineSelect.Trigger className="gap-1.5">
                <ColumnCategoryDisc category={task.category} className="size-3.5" />
                <span className="truncate text-sm">{current?.name}</span>
                <InlineSelect.Indicator />
            </InlineSelect.Trigger>
            <InlineSelect.Popover className="w-44">
                <ColumnListBox columns={board.columns} />
            </InlineSelect.Popover>
        </InlineSelect>
    );
}
