import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { taskRoute, tasksRoute } from '../../features/servers/server-routes.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWorkerRecord } from '../../hooks/servers/use-worker.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { serverRouteModules } from './server-route-modules.ts';

const WorkerView = React.lazy(async () => ({
    default: (await serverRouteModules.worker()).WorkerView,
}));
const WorkerBandMenu = React.lazy(async () => ({
    default: (await serverRouteModules.worker()).WorkerBandMenu,
}));

export function WorkerPageRoute() {
    const { workerId = '' } = useParams();
    const { server } = useServerContext();
    const work = useWorkerRecord(server.id, workerId).data;
    const task = useTask(server.id, work?.taskId ? { taskId: work.taskId } : undefined).data;
    useWindowTitle(work?.title ?? 'Worker');
    const crumbs = [
        { href: tasksRoute(server.slug), label: 'Tasks' },
        ...(task ? [{ href: taskRoute(server.slug, task.key), label: task.key }] : []),
    ];

    return (
        <section aria-label={work?.title ?? 'Worker'} className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail crumbs={crumbs} current={work?.title ?? ''} />
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        {work ? <WorkerBandMenu work={work} /> : null}
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <WorkerView workerId={workerId} />
            </React.Suspense>
        </section>
    );
}
