import { EmptyState } from '@heroui-pro/react';
import { Alert02Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Navigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { readLastBoardId } from '../../features/servers/server-choice.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useBoards } from '../../hooks/boards/use-boards.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { resolveTasksSectionRoute } from './server-route-state.ts';

/**
 * `/tasks` is an address, not a page: it lands on the last-viewed board, or the
 * first. Until `board.list` answers it holds the band and paints nothing else,
 * so the redirect never flashes a page of its own.
 */
export function TasksIndexRoute() {
    useWindowTitle('Tasks');
    const { server } = useServerContext();
    const boards = useBoards(server.id);
    const route = boards.data
        ? resolveTasksSectionRoute(boards.data, readLastBoardId(server.slug), server.slug)
        : null;
    if (route) {
        return <Navigate replace to={route} />;
    }

    return (
        <section aria-label="Tasks" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Tasks" />
            </PageBand>
            {boards.isPending ? null : (
                <EmptyState className="flex-1">
                    <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                            <Icon aria-hidden="true" icon={Alert02Icon} />
                        </EmptyState.Media>
                        <EmptyState.Title>Boards unavailable</EmptyState.Title>
                        <EmptyState.Description>
                            Haus could not load this Server's boards.
                        </EmptyState.Description>
                    </EmptyState.Header>
                </EmptyState>
            )}
        </section>
    );
}
