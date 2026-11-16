import { formatTaskKey, parseTaskKey } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { boardRoute, tasksRoute } from '../../features/servers/server-routes.ts';
import type { BandCrumb } from '../../features/shell/band-trail.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { copyTaskReference } from '../../features/tasks/copy-task-reference.ts';
import { useBoard } from '../../hooks/boards/use-board.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const TaskPage = React.lazy(async () => ({
    default: (await serverRouteModules.task()).TaskPage,
}));

/** A Task's frame: "Haus › Tasks › General › SEC-12". An address no key can parse goes to `/tasks`. */
export function TaskPageRoute() {
    const { boardKey = '', number = '' } = useParams();
    const { server } = useServerContext();
    const parsed = parseTaskKey(`${boardKey}-${number}`);
    const taskKey = parsed ? formatTaskKey(parsed.boardKey, parsed.number) : null;
    const board = useBoard(server.id, boardKey);
    useWindowTitle(taskKey ?? 'Tasks');

    if (!taskKey) {
        return <Navigate replace to={tasksRoute(server.slug)} />;
    }

    const crumbs: BandCrumb[] = [{ href: tasksRoute(server.slug), label: 'Tasks' }];
    if (board) {
        crumbs.push({ href: boardRoute(server.slug, board.key), label: board.name });
    }
    return (
        <section aria-label={taskKey} className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail crumbs={crumbs} current={taskKey} />
                <PageBand.Controls>
                    <Button onPress={() => copyTaskReference(taskKey)} size="sm" variant="ghost">
                        Copy reference
                    </Button>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TaskPage taskKey={taskKey} />
            </React.Suspense>
        </section>
    );
}
