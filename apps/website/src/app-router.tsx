import * as React from 'react';
import { createBrowserRouter, createHashRouter } from 'react-router-dom';
import { ActivationLoading } from './components/activation/activation-loading.tsx';
import { AppFrame } from './components/app-frame.tsx';
import { ComputerLoginRoutes } from './features/computers/computer-login-routes.tsx';
import { HausServerRoutes } from './features/servers/haus-server-routes.tsx';
import { isElectronDesktopApp } from './lib/desktop-bridge.ts';
import { serverPageRoutes } from './routes/app/server-page-routes.tsx';
import { cachedRouteModule, registerServerRouteShells } from './routes/app/server-route-modules.ts';

const ServerErrorPage = React.lazy(async () => {
    const module = await import('./routes/app/server-error-page.tsx');
    return { default: module.ServerErrorPage };
});

const loadServerShells = cachedRouteModule(async () => {
    const shells = await import('./routes/app/server-route-shells.tsx');
    registerServerRouteShells(shells);
    return shells;
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
    const desktop = isElectronDesktopApp();
    const createRouter = desktop ? createHashRouter : createBrowserRouter;
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
                                    lazy: lazyRoute(loadServerShells, 'ServerLayout'),
                                    children: [
                                        {
                                            errorElement: <ServerErrorBoundary />,
                                            children: serverPageRoutes({ desktop }),
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
