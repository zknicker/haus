import * as React from 'react';
import { Navigate, type RouteObject, useParams } from 'react-router-dom';
import { serverRoute } from '../../features/servers/server-routes.ts';
import {
    AgentHomeRedirect,
    LegacyComputersRedirect,
    LegacyMemberRedirect,
} from './legacy-redirects.tsx';
import { readServerRouteShells } from './server-route-modules.ts';

/**
 * The one table of pages inside a Server (`/s/:slug/…`). The web mounts it
 * under the window router's `ServerLayout`; desktop mounts the same table in
 * every tab's own router (ADR 0039), plus the pages only a tab shows: a
 * Thread, a chat's Files, and an artifact. Child routes render cached frames
 * synchronously (no `lazy`), which is what lets a plain `useRoutes` serve them.
 */
export function serverPageRoutes({ desktop }: { desktop: boolean }): RouteObject[] {
    return [
        { index: true, Component: serverRouteComponent('ServerDefaultPage') },
        { path: 'search', Component: serverRouteComponent('SearchRoute') },
        { path: 'archived', Component: serverRouteComponent('ArchivedChatsRoute') },
        { path: 'chats/:chatId', Component: serverRouteComponent('ChatRoute') },
        { path: 'dm/:agentId', Component: serverRouteComponent('ImplicitAgentDmRoute') },
        { path: 'inbox', Component: serverRouteComponent('InboxPage') },
        { path: 'tasks', Component: serverRouteComponent('TasksPage') },
        // An Agent is a first-class record, so its page lives in the Server
        // layout rather than inside the settings rail.
        { path: 'agents/:agentId', element: <AgentHomeRedirect /> },
        { path: 'agents/:agentId/:section', Component: serverRouteComponent('AgentProfileRoute') },
        // The members browser is gone: an Agent has its own page, and a human
        // is a record under Settings > Members.
        { path: 'members/agents/:agentId/*', element: <LegacyMemberRedirect kind="agents" /> },
        { path: 'members/humans/:userId', element: <LegacyMemberRedirect kind="humans" /> },
        // Splat so `/members/humans` and any other stale sub-path land on the
        // directory rather than falling through to the Server's default route.
        { path: 'members/*', element: <Navigate replace to="../settings/members" /> },
        { path: 'computers', element: <LegacyComputersRedirect /> },
        { path: 'connections', element: <Navigate replace to="../settings/connections" /> },
        {
            path: 'settings',
            Component: serverRouteComponent('ServerSettingsPage'),
            children: [
                { index: true, element: <Navigate replace to="profile" /> },
                // An Agent left Settings; its old deep links (tab included) still resolve.
                {
                    path: 'members/agents/:agentId/*',
                    element: <LegacyMemberRedirect kind="agents" />,
                },
                {
                    path: 'members/humans/:userId',
                    Component: serverRouteComponent('DeferredSettingsHumanRoute'),
                },
                {
                    path: 'connections/:connectionId',
                    Component: serverRouteComponent('DeferredSettingsConnectionRoute'),
                },
                {
                    path: ':section',
                    Component: serverRouteComponent('DeferredSettingsSectionRoute'),
                },
            ],
        },
        ...(desktop ? desktopPageRoutes : []),
        { path: '*', element: <ServerUnknownPage /> },
    ];
}

const ThreadPageRoute = React.lazy(async () => ({
    default: (await import('./desktop-tab-pages.tsx')).ThreadPageRoute,
}));
const FilesPageRoute = React.lazy(async () => ({
    default: (await import('./desktop-tab-pages.tsx')).FilesPageRoute,
}));
const ArtifactPageRoute = React.lazy(async () => ({
    default: (await import('./artifact-page-route.tsx')).ArtifactPageRoute,
}));

/** Pages only a desktop tab shows; the web hosts them in the chat side pane. */
const desktopPageRoutes: RouteObject[] = [
    { path: 'threads/:chatId/:anchorMessageId', element: deferred(<ThreadPageRoute />) },
    { path: 'files/:chatId', element: deferred(<FilesPageRoute />) },
    { path: 'artifacts/:artifactKey', element: deferred(<ArtifactPageRoute />) },
];

function deferred(element: React.ReactNode) {
    return <React.Suspense fallback={null}>{element}</React.Suspense>;
}

function ServerUnknownPage() {
    const { slug = '' } = useParams();
    return <Navigate replace to={serverRoute(slug)} />;
}

function serverRouteComponent(exportName: keyof ReturnType<typeof readServerRouteShells>) {
    return function ServerRouteFrame() {
        const Component = readServerRouteShells()[exportName];
        return <Component />;
    };
}
