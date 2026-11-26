import { isTaskShortId } from '@haus/api';
import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { tasksRoute } from '../../features/servers/server-routes.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { usePaneWideEnough } from '../../features/tasks/use-pane-wide-enough.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { serverRouteModules } from './server-route-modules.ts';

const TaskPage = React.lazy(async () => ({
    default: (await serverRouteModules.task()).TaskPage,
}));
const TaskBandControls = React.lazy(async () => ({
    default: (await serverRouteModules.task()).TaskBandControls,
}));

const taskPanelMinWidth = 900;

export function TaskPageRoute() {
    const { shortId: param = '' } = useParams();
    const { server } = useServerContext();
    const frameRef = React.useRef<HTMLElement>(null);
    const panelShown = usePaneWideEnough(frameRef, taskPanelMinWidth);
    const shortId = isTaskShortId(param) ? param : null;
    const task = useTask(server.id, shortId ? { shortId } : undefined).data;
    const current = task ? task.title : 'Task';
    useWindowTitle(current);

    if (!shortId) {
        return <Navigate replace to={tasksRoute(server.slug)} />;
    }
    return (
        <section aria-label={current} className="flex min-h-0 flex-1 flex-col" ref={frameRef}>
            <PageBand>
                <PageBand.Trail
                    crumbs={[{ href: tasksRoute(server.slug), label: 'Tasks' }]}
                    current={task ? { identifier: task.shortId, label: task.title } : current}
                />
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        <TaskBandControls detailsInBand={!panelShown} shortId={shortId} />
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TaskPage panelShown={panelShown} shortId={shortId} />
            </React.Suspense>
        </section>
    );
}
