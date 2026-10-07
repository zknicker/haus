import { Breadcrumbs } from '@heroui/react';
import * as React from 'react';
import { useServerContext } from '../../features/servers/server-context.ts';
import { inboxRoute } from '../../features/servers/server-routes.ts';
import { RouteTabIcon } from '../../features/shell/route-tab-presentation.tsx';
import { SectionHeader } from '../../features/shell/section-header.tsx';
import { PageTopbar } from '../../features/shell/shell-topbar.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const ActivityPageContent = React.lazy(async () => ({
    default: (await serverRouteModules.activity()).ActivityPageContent,
}));

/**
 * The Server's Activity page: every Agent's turns in one event log. Its band
 * is the Inbox's (route glyph, "Haus › Activity"); the log scrolls in the
 * page's own region so its day bar pins under the band, as on an Agent's
 * Activity tab.
 */
export function ActivityPage() {
    useWindowTitle('Activity');
    const { server } = useServerContext();

    return (
        <section aria-label="Activity" className="flex min-h-0 flex-1 flex-col">
            <PageTopbar>
                <SectionHeader
                    leading={
                        <div className="flex min-w-0 shrink items-center gap-2">
                            <RouteTabIcon className="text-muted" size={16} tab="activity" />
                            <Breadcrumbs className="min-w-0">
                                <Breadcrumbs.Item href={inboxRoute(server.slug)}>
                                    Haus
                                </Breadcrumbs.Item>
                                <Breadcrumbs.Item>Activity</Breadcrumbs.Item>
                            </Breadcrumbs>
                        </div>
                    }
                />
            </PageTopbar>
            <div className="@container min-h-0 flex-1 overflow-y-auto pb-16 [scrollbar-gutter:stable]">
                <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                    <ActivityPageContent />
                </React.Suspense>
            </div>
        </section>
    );
}
