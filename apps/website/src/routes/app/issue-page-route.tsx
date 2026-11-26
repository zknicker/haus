import { parseIssueCode } from '@haus/api';
import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useServerContext } from '../../features/servers/server-context.ts';
import { issuesRoute } from '../../features/servers/server-routes.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { useIssueDetail } from '../../hooks/issues/use-issue-list.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const IssuePage = React.lazy(async () => ({
    default: (await serverRouteModules.issue()).IssuePage,
}));
const IssueBandControls = React.lazy(async () => ({
    default: (await serverRouteModules.issue()).IssueBandControls,
}));

export function IssuePageRoute() {
    const { code: param = '' } = useParams();
    const { server } = useServerContext();
    const code = parseIssueCode(param) ? param : null;
    const issue = useIssueDetail(server.id, code).data?.issue;
    const current = issue ? issue.title : (code ?? 'Issue');
    useWindowTitle(current);

    if (!code) {
        return <Navigate replace to={issuesRoute(server.slug)} />;
    }
    return (
        <section aria-label={current} className="flex min-h-0 flex-1 flex-col">
            <PageBand>
                <PageBand.Trail
                    crumbs={[{ href: issuesRoute(server.slug), label: 'Issues' }]}
                    current={issue ? { identifier: issue.code, label: issue.title } : current}
                />
                <PageBand.Controls>
                    <React.Suspense fallback={null}>
                        <IssueBandControls code={code} />
                    </React.Suspense>
                </PageBand.Controls>
            </PageBand>
            <React.Suspense fallback={<div aria-busy="true" className="min-h-0 flex-1" />}>
                <IssuePage code={code} />
            </React.Suspense>
        </section>
    );
}
