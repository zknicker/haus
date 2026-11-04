import * as React from 'react';
import { ClaimControls } from '../../features/servers/claims/claim-controls.tsx';
import { ClaimFilterRow } from '../../features/servers/claims/claim-filter-row.tsx';
import { useClaimFilterFields } from '../../features/servers/claims/claim-filters.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';

import { serverRouteModules } from './server-route-modules.ts';

const TasksPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.tasks()).TasksPageContent,
}));

export function TasksPage() {
    useWindowTitle('Tasks');
    const { server } = useServerContext();
    const fields = useClaimFilterFields();
    const canManage = server.role === 'owner' || server.role === 'admin';
    const hasFilters = fields.some((field) => field.applied !== null);

    return (
        <section aria-label="Tasks" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Tasks" />
                {/* Applied filters follow the trail, beside the controls that set them. */}
                {hasFilters ? <ClaimFilterRow fields={fields} /> : null}
                <PageBand.Controls>
                    <ClaimControls canManage={canManage} fields={fields} />
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <TasksPageContent />
            </React.Suspense>
        </section>
    );
}
