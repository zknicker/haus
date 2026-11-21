import * as React from 'react';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ActivityPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.activity()).ActivityPageContent,
}));
const CaptainActivityStrip = React.lazy(async () => ({
    default: (await serverRouteModules.activity()).CaptainActivityStrip,
}));

/**
 * The Server's Activity page: every Agent's turns in one event log. Its band
 * is "Haus › Activity"; the log scrolls in the
 * page's own region so its day bar pins under the band, as on an Agent's
 * Activity tab.
 */
export function ActivityPage() {
    useWindowTitle('Activity');

    return (
        <section aria-label="Activity" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Activity" />
            </PageBand>
            <div className="@container min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable]">
                <React.Suspense fallback={null}>
                    <CaptainActivityStrip className="px-3 pt-3 pb-2" />
                </React.Suspense>
                <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                    <ActivityPageContent />
                </React.Suspense>
            </div>
        </section>
    );
}
