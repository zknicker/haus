import * as React from 'react';
import {
    ActivityViewSwitch,
    useActivityView,
} from '../../features/servers/activity/server-activity-view.tsx';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ActivityPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.activity()).ActivityPageContent,
}));

/**
 * The Server's Activity page: every Agent's turns in one event log. Its band
 * is "Haus › Activity"; the log scrolls in the
 * page's own region so its day bar pins under the band, as on an Agent's
 * Activity tab.
 */
export function ActivityPage() {
    useWindowTitle('Activity');
    const { setView, view } = useActivityView();

    return (
        <section aria-label="Activity" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Activity" />
                <PageBand.Controls>
                    <ActivityViewSwitch onChange={setView} view={view} />
                </PageBand.Controls>
            </PageBand>
            <div className="@container min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable]">
                <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                    <ActivityPageContent />
                </React.Suspense>
            </div>
        </section>
    );
}
