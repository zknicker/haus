import * as React from 'react';
import { useServerContext } from '../../features/servers/server-context.ts';
import { TaskControls } from '../../features/servers/tasks/task-controls.tsx';
import { TaskFilterRow } from '../../features/servers/tasks/task-filter-row.tsx';
import { useTaskFilterFields } from '../../features/servers/tasks/task-filters.tsx';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';

import { serverRouteModules } from './server-route-modules.ts';

const TasksPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.tasks()).TasksPageContent,
}));

export function TasksPage() {
    useWindowTitle('Tasks');
    const { server } = useServerContext();
    const fields = useTaskFilterFields();
    const canManage = server.role === 'owner' || server.role === 'admin';
    const hasFilters = fields.some((field) => field.applied !== null);

    return (
        <section aria-label="Tasks" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Tasks" />
                {/* Applied filters follow the trail, beside the controls that set them. */}
                {hasFilters ? <TaskFilterRow fields={fields} /> : null}
                <PageBand.Controls>
                    <TaskControls canManage={canManage} fields={fields} />
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TasksPageContent />
            </React.Suspense>
        </section>
    );
}
