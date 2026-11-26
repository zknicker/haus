import * as React from 'react';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const IssuesPage = React.lazy(async () => ({
    default: (await serverRouteModules.issues()).IssuesPage,
}));
const IssuesBandControls = React.lazy(async () => ({
    default: (await serverRouteModules.issues()).IssuesBandControls,
}));

export function IssuesPageRoute() {
    useWindowTitle('Issues');
    return (
        <section aria-label="Issues" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Issues" />
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        <IssuesBandControls />
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <IssuesPage />
            </React.Suspense>
        </section>
    );
}
