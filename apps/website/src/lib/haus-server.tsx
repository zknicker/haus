import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import * as React from 'react';
import type { HausRouter } from '../../../server/src/haus-api/router.ts';
import { UpdateRequiredGate } from '../features/servers/update-required-gate.tsx';
import { getAppSessionAccessToken, useAppAuth } from './app-auth.tsx';
import {
    createHausConnection,
    type HausConnection,
    type HausServerConnectionState,
    reconnectHausSession,
    refreshHausSession,
} from './haus-connection.ts';
import { HausSessionRefreshContext, singleFlightSessionRefresh } from './haus-session-context.ts';
import { refreshRefusedSession } from './haus-session-refresh.ts';
import { hydrateClaimedQueryCache, useQueryCacheOffer } from './query-cache-handoff.ts';
import { installQueryFocusSources } from './query-focus.ts';
import { queryClientDefaultOptions } from './query-policy.ts';
import { readStartMarks } from './start-reconciliation.ts';

/** The App's authenticated HTTP and WebSocket connection to Haus Server. */
export const hausTrpc = createTRPCReact<HausRouter>();

export type HausOutputs = inferRouterOutputs<HausRouter>;
export type HausInputs = inferRouterInputs<HausRouter>;
export type ServerSummary = HausOutputs['server']['list'][number];
export type ServerDetail = HausOutputs['server']['bySlug'];
export type { HausServerConnectionState } from './haus-connection.ts';

// Dev builds only: the constant folds to null in prod, so the chunk is never emitted.
const DevPerfTools = import.meta.env.DEV
    ? React.lazy(() => import('../features/dev-tools/dev-perf-tools.tsx'))
    : null;

// Provenance only; the build injects the App package version (see vite.config).
const productVersion = import.meta.env.VITE_HAUS_PRODUCT_VERSION ?? '0.0.0-dev';
const HausServerConnectionContext = React.createContext<HausServerConnectionState>('connecting');

export function getHausServerOrigin(): string {
    return resolveHausServerOrigin(
        import.meta.env.VITE_HAUS_SERVER_ORIGIN,
        globalThis.window?.location.origin,
        import.meta.env.DEV
    );
}

export function resolveHausServerOrigin(
    configuredOrigin: string | undefined,
    browserOrigin: string | undefined,
    allowDevelopmentOverride = false
): string {
    if (allowDevelopmentOverride) {
        const configuredUrl = parseHttpOrigin(configuredOrigin);
        if (configuredUrl) {
            return configuredUrl.origin;
        }
    }

    const browserUrl = parseHttpOrigin(browserOrigin);
    if (browserUrl) {
        return browserUrl.origin;
    }

    throw new Error(
        'The Haus Server origin is unavailable. Open Haus App over HTTP(S) or configure VITE_HAUS_SERVER_ORIGIN for development.'
    );
}

function parseHttpOrigin(value: string | undefined) {
    if (!value) {
        return null;
    }
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
}

export function HausServerProvider({ children }: React.PropsWithChildren) {
    const { refresh: refreshAppSession, session } = useAppAuth();
    const userId = session?.user.id ?? null;
    const [queryClient] = React.useState(() => {
        const client = new QueryClient({ defaultOptions: queryClientDefaultOptions });
        // Before any read, so a stream start can tell reads fetched after it apart.
        readStartMarks(client);
        hydrateClaimedQueryCache(client, userId);
        return client;
    });
    useQueryCacheOffer(queryClient, userId);
    React.useEffect(() => installQueryFocusSources(), []);
    // Presentation only: a reconnect recovers through each stream's start
    // reconciliation (specs/realtime-events.md, "Recovery"), not here.
    const [connectionState, setConnectionState] =
        React.useState<HausServerConnectionState>('connecting');
    const [connection, setConnection] = React.useState<HausConnection | null>(null);
    const refreshSession = React.useMemo(
        () =>
            singleFlightSessionRefresh(() =>
                connection
                    ? refreshRefusedSession({
                          refreshAppSession,
                          readAccessToken: async () => getAppSessionAccessToken(),
                          reconnect: () => reconnectHausSession(connection.wsClient),
                          refreshSession: (token) => refreshHausSession(connection, token),
                      })
                    : Promise.resolve(true)
            ),
        [connection, refreshAppSession]
    );

    React.useEffect(() => {
        let active = true;
        const nextConnection = createHausConnection({
            onConnectionState: (state) => {
                if (active) {
                    setConnectionState(state);
                }
            },
            origin: getHausServerOrigin(),
            productVersion,
            readAccessToken: async () => getAppSessionAccessToken(),
        });
        setConnection(nextConnection);

        return () => {
            active = false;
            void nextConnection.wsClient.close();
        };
    }, []);

    const previousSession = React.useRef(session);
    React.useEffect(() => {
        if (!connection) {
            return;
        }
        const previous = previousSession.current;
        previousSession.current = session;
        if (previous?.accessToken === session?.accessToken) {
            return;
        }
        if (
            previous &&
            session &&
            previous.user.id === session.user.id &&
            previous.sessionId === session.sessionId
        ) {
            void refreshHausSession(connection, session.accessToken).catch(() => {
                reconnectHausSession(connection.wsClient);
            });
            return;
        }
        reconnectHausSession(connection.wsClient);
    }, [connection, session]);

    if (!connection) {
        return null;
    }

    return (
        <HausServerConnectionContext value={connectionState}>
            <HausSessionRefreshContext value={refreshSession}>
                <QueryClientProvider client={queryClient}>
                    <hausTrpc.Provider client={connection.client} queryClient={queryClient}>
                        <UpdateRequiredGate queryClient={queryClient}>
                            {children}
                        </UpdateRequiredGate>
                        {DevPerfTools ? (
                            <React.Suspense fallback={null}>
                                <DevPerfTools />
                            </React.Suspense>
                        ) : null}
                    </hausTrpc.Provider>
                </QueryClientProvider>
            </HausSessionRefreshContext>
        </HausServerConnectionContext>
    );
}

export function useHausServerConnectionState() {
    return React.use(HausServerConnectionContext);
}
