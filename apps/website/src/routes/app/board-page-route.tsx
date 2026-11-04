import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { rememberLastBoardId } from '../../features/servers/server-choice.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { tasksRoute } from '../../features/servers/server-routes.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useBoard } from '../../hooks/boards/use-board.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const BoardPage = React.lazy(async () => ({
    default: (await serverRouteModules.board()).BoardPage,
}));
const BoardControls = React.lazy(async () => ({
    default: (await serverRouteModules.board()).BoardControls,
}));

/**
 * A board's frame: "Haus › Tasks › General". A key `board.list` does not name
 * (archived, re-keyed, mistyped) falls back to `/tasks`, which lands on a real
 * board. The view is the last one remembered, so `/tasks` returns to it.
 */
export function BoardPageRoute() {
    const { boardKey = '' } = useParams();
    const { server } = useServerContext();
    const board = useBoard(server.id, boardKey);
    const boardId = board?.id;
    useWindowTitle(board?.name ?? 'Tasks');
    React.useEffect(() => {
        if (boardId) {
            rememberLastBoardId(server.slug, boardId);
        }
    }, [boardId, server.slug]);

    if (board === null) {
        return <Navigate replace to={tasksRoute(server.slug)} />;
    }

    return (
        <section aria-label={board?.name ?? 'Tasks'} className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                {board ? (
                    <PageBand.Trail
                        crumbs={[{ href: tasksRoute(server.slug), label: 'Tasks' }]}
                        current={board.name}
                    />
                ) : (
                    <PageBand.Trail current="Tasks" />
                )}
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        {board ? <BoardControls boardKey={board.key} /> : null}
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                {board ? <BoardPage boardKey={board.key} /> : null}
            </React.Suspense>
        </section>
    );
}
