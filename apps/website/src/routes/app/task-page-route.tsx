import { parseTaskKey } from '@haus/api';
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

/** The right-hand panel needs room beside a readable transcript: the pane's width, not the window's. */
const taskPanelMinWidth = 900;

/**
 * A Task's frame: "Haus › Tasks › SEC-12 Title", its state, assignee, and
 * follow controls in the band, then the conversation and its right-hand
 * panel. The frame measures the pane once: wide enough, the page shows the
 * panel; narrower, the band carries a Details control instead. The band is
 * the page's one header; the transcript starts right under it. An address no
 * key can parse goes to `/tasks`.
 */
export function TaskPageRoute() {
    const { taskKey: param = '' } = useParams();
    const { server } = useServerContext();
    const frameRef = React.useRef<HTMLElement>(null);
    const panelShown = usePaneWideEnough(frameRef, taskPanelMinWidth);
    const taskKey = parseTaskKey(param) ? param : null;
    const task = useTask(server.id, taskKey ? { key: taskKey } : undefined).data;
    const current = task ? `${task.key} ${task.title}` : (taskKey ?? 'Task');
    useWindowTitle(current);

    if (!taskKey) {
        return <Navigate replace to={tasksRoute(server.slug)} />;
    }
    return (
        <section aria-label={current} className="flex min-h-0 flex-1 flex-col" ref={frameRef}>
            <PageBand>
                <PageBand.Trail
                    crumbs={[{ href: tasksRoute(server.slug), label: 'Tasks' }]}
                    current={current}
                />
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        <TaskBandControls detailsInBand={!panelShown} taskKey={taskKey} />
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TaskPage panelShown={panelShown} taskKey={taskKey} />
            </React.Suspense>
        </section>
    );
}
