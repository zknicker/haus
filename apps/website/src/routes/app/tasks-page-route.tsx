import * as React from 'react';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const TasksPage = React.lazy(async () => ({
    default: (await serverRouteModules.tasks()).TasksPage,
}));

export function TasksPageRoute() {
    useWindowTitle('Tasks');
    return (
        <section aria-label="Tasks" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Tasks" />
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TasksPage />
            </React.Suspense>
        </section>
    );
}
