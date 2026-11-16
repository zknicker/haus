import * as React from 'react';
import { useBoard } from '../../hooks/boards/use-board.ts';
import { useTasks } from '../../hooks/tasks/use-tasks.ts';
import { useServerContext } from '../servers/server-context.ts';
import { BoardCanvas } from './board-canvas.tsx';
import { BoardList } from './board-list.tsx';
import { BoardToolbar } from './board-toolbar.tsx';
import { filterTasks, groupTasksByColumn, summarizeTasks } from './board-view.ts';
import { useBoardView } from './use-board-view.ts';

export { BoardControls } from './board-controls.tsx';

/**
 * A board's body under the route's band. It owns the one `task.list` read and
 * which columns show; the lens and the filters ride the URL. Filtering here,
 * not in the read, keeps the board's own truth (open counts, the active
 * warning) whatever the reader narrows to.
 */
export function BoardPage({ boardKey }: { boardKey: string }) {
    const { server } = useServerContext();
    const board = useBoard(server.id, boardKey);
    const tasks = useTasks({ boardId: board?.id, serverId: server.id });
    const { filters, layout } = useBoardView();
    const [showCanceled, setShowCanceled] = React.useState(false);
    const allTasks = tasks.data;
    const shown = React.useMemo(
        () => (allTasks ? filterTasks(allTasks, filters) : []),
        [allTasks, filters]
    );
    const groups = React.useMemo(() => {
        const columns = board ? groupTasksByColumn(board, shown) : [];
        return showCanceled
            ? columns
            : columns.filter((group) => group.column.category !== 'canceled');
    }, [board, shown, showCanceled]);

    // Blank until the read answers: an unresolved board is not an empty one.
    if (!(board && allTasks)) {
        return <div aria-busy="true" className="min-h-0 flex-1" />;
    }
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <BoardToolbar
                {...summarizeTasks(shown)}
                onToggleCanceled={() => setShowCanceled((current) => !current)}
                showCanceled={showCanceled}
            />
            {layout === 'board' ? (
                <BoardCanvas allTasks={allTasks} board={board} groups={groups} />
            ) : (
                <BoardList
                    board={board}
                    filtered={filters.assignee !== null || filters.labelId !== null}
                    groups={groups}
                />
            )}
        </div>
    );
}
