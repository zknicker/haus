import * as React from 'react';
import { createBrowserRouter, createHashRouter, Navigate, useParams } from 'react-router-dom';
import { ActivationLoading } from './components/activation/activation-loading.tsx';
import { AppFrame } from './components/app-frame.tsx';
import { ComputerLoginRoutes } from './features/computers/computer-login-routes.tsx';
import { HausServerRoutes } from './features/servers/haus-server-routes.tsx';
import { serverRoute } from './features/servers/server-routes.ts';
import { isElectronDesktopApp } from './lib/desktop-bridge.ts';
import {
    AgentHomeRedirect,
    LegacyComputersRedirect,
    LegacyMemberRedirect,
} from './routes/app/legacy-redirects.tsx';
import { readServerRouteShells, serverRouteModules } from './routes/app/server-route-modules.ts';

const ServerErrorPage = React.lazy(async () => {
    const module = await import('./routes/app/server-error-page.tsx');
    return { default: module.ServerErrorPage };
});

function lazyRoute<TModule extends Record<string, unknown>>(
    load: () => Promise<TModule>,
    exportName: keyof TModule
) {
    return async () => {
        const module = await load();
        const Component = module[exportName];
        if (typeof Component !== 'function') {
            throw new Error(`Route export "${String(exportName)}" is not a component.`);
        }
        return { Component };
    };
}

/** The App is a Server client; Electron supplies only native actions. */
export function createAppRouter() {
    const createRouter = isElectronDesktopApp() ? createHashRouter : createBrowserRouter;
    return createRouter([
        {
            element: <AppFrame />,
            hydrateFallbackElement: <ActivationLoading />,
            children: [
                ...(import.meta.env.DEV
                    ? [
                          {
                              path: 'prototype/activation/*',
                              lazy: lazyRoute(
                                  () =>
                                      import(
                                          './features/activation-preview/activation-preview-route.tsx'
                                      ),
                                  'ActivationPreviewRoute'
                              ),
                          },
                      ]
                    : []),
                {
                    element: <HausServerRoutes />,
                    children: [
                        {
                            index: true,
                            lazy: lazyRoute(
                                () => import('./routes/app/servers-page.tsx'),
                                'ServersPage'
                            ),
                        },
                        {
                            path: 's',
                            lazy: lazyRoute(
                                () => import('./routes/app/servers-page.tsx'),
                                'ServersPage'
                            ),
                        },
                        {
                            path: 's/:slug',
                            lazy: lazyRoute(
                                () => import('./features/onboarding/cove-onboarding-route.tsx'),
                                'CoveOnboardingRoute'
                            ),
                            children: [
                                {
                                    lazy: lazyRoute(serverRouteModules.shell, 'ServerLayout'),
                                    children: [
                                        {
                                            errorElement: <ServerErrorBoundary />,
                                            children: [
                                                {
                                                    index: true,
                                                    Component:
                                                        serverRouteComponent('ServerDefaultPage'),
                                                },
                                                {
                                                    path: 'search',
                                                    Component: serverRouteComponent('SearchRoute'),
                                                },
                                                {
                                                    path: 'archived',
                                                    Component:
                                                        serverRouteComponent('ArchivedChatsRoute'),
                                                },
                                                {
                                                    path: 'chats/:chatId',
                                                    Component: serverRouteComponent('ChatRoute'),
                                                },
                                                {
                                                    path: 'dm/:agentId',
                                                    Component:
                                                        serverRouteComponent(
                                                            'ImplicitAgentDmRoute'
                                                        ),
                                                },
                                                {
                                                    path: 'inbox',
                                                    Component: serverRouteComponent('InboxPage'),
                                                },
                                                {
                                                    path: 'tasks',
                                                    Component: serverRouteComponent('TasksPage'),
                                                },
                                                {
                                                    // An Agent is a first-class
                                                    // record, so its page lives
                                                    // in the Server layout rather
                                                    // than inside the settings rail.
                                                    path: 'agents/:agentId',
                                                    element: <AgentHomeRedirect />,
                                                },
                                                {
                                                    path: 'agents/:agentId/:section',
                                                    Component:
                                                        serverRouteComponent('AgentProfileRoute'),
                                                },
                                                {
                                                    // The members browser is gone: an Agent has
                                                    // its own page, and a human is a record
                                                    // under Settings > Members.
                                                    path: 'members/agents/:agentId/*',
                                                    element: <LegacyMemberRedirect kind="agents" />,
                                                },
                                                {
                                                    path: 'members/humans/:userId',
                                                    element: <LegacyMemberRedirect kind="humans" />,
                                                },
                                                {
                                                    // Splat so `/members/humans`
                                                    // and any other stale sub-path
                                                    // land on the directory rather
                                                    // than falling through to the
                                                    // Server's default route.
                                                    path: 'members/*',
                                                    element: (
                                                        <Navigate
                                                            replace
                                                            to="../settings/members"
                                                        />
                                                    ),
                                                },
                                                {
                                                    path: 'computers',
                                                    element: <LegacyComputersRedirect />,
                                                },
                                                {
                                                    path: 'connections',
                                                    element: (
                                                        <Navigate
                                                            replace
                                                            to="../settings/connections"
                                                        />
                                                    ),
                                                },
                                                {
                                                    path: 'settings',
                                                    Component:
                                                        serverRouteComponent('ServerSettingsPage'),
                                                    children: [
                                                        {
                                                            index: true,
                                                            element: (
                                                                <Navigate replace to="profile" />
                                                            ),
                                                        },
                                                        {
                                                            // An Agent left Settings; its old
                                                            // deep links (tab included) still
                                                            // resolve.
                                                            path: 'members/agents/:agentId/*',
                                                            element: (
                                                                <LegacyMemberRedirect kind="agents" />
                                                            ),
                                                        },
                                                        {
                                                            path: 'members/humans/:userId',
                                                            Component: serverRouteComponent(
                                                                'DeferredSettingsHumanRoute'
                                                            ),
                                                        },
                                                        {
                                                            path: 'connections/:connectionId',
                                                            Component: serverRouteComponent(
                                                                'DeferredSettingsConnectionRoute'
                                                            ),
                                                        },
                                                        {
                                                            path: ':section',
                                                            Component: serverRouteComponent(
                                                                'DeferredSettingsSectionRoute'
                                                            ),
                                                        },
                                                    ],
                                                },
                                                {
                                                    path: '*',
                                                    element: <ServerUnknownPage />,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            path: 'invite/:token',
                            lazy: lazyRoute(
                                () => import('./routes/app/accept-invitation-page.tsx'),
                                'AcceptInvitationPage'
                            ),
                        },
                    ],
                },
                {
                    element: <ComputerLoginRoutes />,
                    children: [
                        {
                            path: 'computer/login',
                            lazy: lazyRoute(
                                () => import('./routes/app/computer-login-page.tsx'),
                                'ComputerLoginPage'
                            ),
                        },
                    ],
                },
            ],
        },
    ]);
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

function ServerErrorBoundary() {
    return (
        <React.Suspense
            fallback={
                <main className="flex min-h-0 flex-1 items-center justify-center text-muted text-sm">
                    Something went wrong…
                </main>
            }
        >
            <ServerErrorPage />
        </React.Suspense>
    );
}
