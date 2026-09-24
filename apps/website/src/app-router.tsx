import * as React from 'react';
import { createBrowserRouter, createHashRouter, Navigate, useParams } from 'react-router-dom';
import { ActivationLoading } from './components/activation/activation-loading.tsx';
import { AppFrame } from './components/app-frame.tsx';
import { ComputerLoginRoutes } from './features/computers/computer-login-routes.tsx';
import { HausServerRoutes } from './features/servers/haus-server-routes.tsx';
import { serverRoute } from './features/servers/server-routes.ts';
import { isElectronDesktopApp } from './lib/desktop-bridge.ts';
import { LegacyComputersRedirect, LegacyMemberRedirect } from './routes/app/legacy-redirects.tsx';
import { serverRouteModules } from './routes/app/server-route-modules.ts';

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
                                    lazy: lazyRoute(
                                        () => import('./routes/app/server-layout.tsx'),
                                        'ServerLayout'
                                    ),
                                    children: [
                                        {
                                            errorElement: <ServerErrorBoundary />,
                                            children: [
                                                {
                                                    index: true,
                                                    lazy: lazyRoute(
                                                        serverRouteModules.default,
                                                        'ServerDefaultPage'
                                                    ),
                                                },
                                                ...(import.meta.env.DEV
                                                    ? [
                                                          {
                                                              path: 'hover-cards',
                                                              lazy: lazyRoute(
                                                                  () =>
                                                                      import(
                                                                          './features/hover-card-preview/hover-card-preview-page.tsx'
                                                                      ),
                                                                  'HoverCardPreviewPage'
                                                              ),
                                                          },
                                                      ]
                                                    : []),
                                                {
                                                    path: 'search',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.search,
                                                        'SearchRoute'
                                                    ),
                                                },
                                                {
                                                    path: 'archived',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.archivedChats,
                                                        'ArchivedChatsRoute'
                                                    ),
                                                },
                                                {
                                                    path: 'chats/:chatId',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.chat,
                                                        'ChatRoute'
                                                    ),
                                                },
                                                {
                                                    path: 'dm/:agentId',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.chat,
                                                        'ImplicitAgentDmRoute'
                                                    ),
                                                },
                                                {
                                                    path: 'inbox',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.inbox,
                                                        'InboxPage'
                                                    ),
                                                },
                                                {
                                                    path: 'tasks',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.tasks,
                                                        'TasksPage'
                                                    ),
                                                },
                                                {
                                                    path: 'usage',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.usage,
                                                        'UsagePage'
                                                    ),
                                                },
                                                {
                                                    // An Agent is a first-class
                                                    // record, so its page lives
                                                    // beside Usage rather than
                                                    // inside the settings rail.
                                                    path: 'agents/:agentId',
                                                    element: <Navigate replace to="overview" />,
                                                },
                                                {
                                                    path: 'agents/:agentId/:tab',
                                                    lazy: lazyRoute(
                                                        serverRouteModules.agent,
                                                        'AgentProfileRoute'
                                                    ),
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
                                                    lazy: lazyRoute(
                                                        serverRouteModules.settings,
                                                        'ServerSettingsPage'
                                                    ),
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
                                                            lazy: lazyRoute(
                                                                serverRouteModules.settingsSection,
                                                                'SettingsHumanRoute'
                                                            ),
                                                        },
                                                        {
                                                            path: ':section',
                                                            lazy: lazyRoute(
                                                                serverRouteModules.settingsSection,
                                                                'SettingsSectionRoute'
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
