import * as React from 'react';
import { useCapyShell } from '../../features/capy-shell/capy-shell-preference.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ActivityPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.activity()).ActivityPageContent,
}));
const CaptainActivityStrip = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxActiveAgents,
}));

/**
 * The Server's Activity page: every Agent's turns in one event log. Its band
 * is "Haus › Activity"; the log scrolls in the
 * page's own region so its day bar pins under the band, as on an Agent's
 * Activity tab.
 */
export function ActivityPage() {
    useWindowTitle('Activity');
    const capyShell = useCapyShell();

    return (
        <section aria-label="Activity" className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail current="Activity" />
            </PageBand>
            <div className="@container min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable]">
                {capyShell ? (
                    <div className="px-3 pt-3 pb-2">
                        <React.Suspense fallback={null}>
                            <CaptainActivityStrip />
                        </React.Suspense>
                    </div>
                ) : null}
                <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                    <ActivityPageContent />
                </React.Suspense>
            </div>
        </section>
    );
}
