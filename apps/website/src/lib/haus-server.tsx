import { appProtocolHeaders, appProtocolVersion } from '@haus/api/app-protocol';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createTRPCClient,
    createWSClient,
    httpBatchLink,
    httpLink,
    splitLink,
    TRPCClientError,
    type TRPCWebSocketClient,
    wsLink,
} from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import * as React from 'react';
import type { HausRouter } from '../../../server/src/haus-api/router.ts';
import { UpdateRequiredGate } from '../features/servers/update-required-gate.tsx';
import { getClerkSessionToken } from './clerk.tsx';
import { watchHausSession } from './haus-session-refresh.ts';
import { hydrateClaimedQueryCache, useQueryCacheOffer } from './query-cache-handoff.ts';
import { queryClientDefaultOptions } from './query-policy.ts';
import {
    type ConnectionState,
    createQueryReconnectHandler,
    isReconnectRecoveredQuery,
} from './query-reconnect-recovery.ts';

/** The App's authenticated HTTP and WebSocket connection to Haus Server. */
export const hausTrpc = createTRPCReact<HausRouter>();

export type HausOutputs = inferRouterOutputs<HausRouter>;
export type HausInputs = inferRouterInputs<HausRouter>;
export type ServerSummary = HausOutputs['server']['list'][number];
export type ServerDetail = HausOutputs['server']['bySlug'];
export type HausServerConnectionState = ConnectionState;

// Dev builds only: the constant folds to null in prod, so the chunk is never emitted.
const DevPerfTools = import.meta.env.DEV
    ? React.lazy(() => import('../features/dev-tools/dev-perf-tools.tsx'))
    : null;

// A local read of Clerk's cached token; Clerk rotates about every 50 seconds,
// so a rotation reaches the socket well before the token it replaces expires.
const sessionWatchIntervalMs = 10_000;
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
    const [queryClient] = React.useState(() => {
        const client = new QueryClient({ defaultOptions: queryClientDefaultOptions });
        hydrateClaimedQueryCache(client);
        return client;
    });
    useQueryCacheOffer(queryClient);
    const [connectionState, setConnectionState] =
        React.useState<HausServerConnectionState>('connecting');
    const [handleConnectionState] = React.useState(() =>
        createQueryReconnectHandler({
            // Each event stream recovers its own reads as it restarts; this pass
            // covers only the Server reads no stream recovers.
            onReconnect: () => {
                void queryClient.invalidateQueries({
                    predicate: isReconnectRecoveredQuery,
                    refetchType: 'active',
                });
            },
            onStateChange: setConnectionState,
        })
    );
    const [connection, setConnection] = React.useState<HausConnection | null>(null);

    React.useEffect(() => {
        let active = true;
        const nextConnection = createHausConnection((state) => {
            if (active) {
                handleConnectionState(state);
            }
        });
        setConnection(nextConnection);

        return () => {
            active = false;
            void nextConnection.wsClient.close();
        };
    }, [handleConnectionState]);

    React.useEffect(() => {
        if (!connection) {
            return;
        }

        const stop = watchHausSession({
            clearTimer: (handle) => window.clearInterval(handle),
            intervalMs: sessionWatchIntervalMs,
            readSessionToken: getClerkSessionToken,
            reconnect: () => reconnectHausSession(connection.wsClient),
            refreshSession: (token) => refreshHausSession(connection, token),
            startTimer: (run, intervalMs) => window.setInterval(run, intervalMs),
        });

        return stop;
    }, [connection]);

    if (!connection) {
        return null;
    }

    return (
        <HausServerConnectionContext value={connectionState}>
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={connection.client} queryClient={queryClient}>
                    <UpdateRequiredGate queryClient={queryClient}>{children}</UpdateRequiredGate>
                    {DevPerfTools ? (
                        <React.Suspense fallback={null}>
                            <DevPerfTools />
                        </React.Suspense>
                    ) : null}
                </hausTrpc.Provider>
            </QueryClientProvider>
        </HausServerConnectionContext>
    );
}

/** One stable tRPC client whose websocket re-authenticates in place. */
function createHausConnection(
    onConnectionState: (state: HausServerConnectionState) => void
): HausConnection {
    const origin = getHausServerOrigin();
    const httpUrl = new URL('/trpc', origin).toString();
    const socketUrl = new URL('/trpc', origin);

    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const wsClient = createWSClient({
        connectionParams: async () => {
            const token = await getClerkSessionToken();
            return {
                appProtocolVersion: String(appProtocolVersion),
                ...(token ? { clerkSessionToken: token } : {}),
                productVersion,
            };
        },
        onClose: () => onConnectionState('reconnecting'),
        onOpen: () => onConnectionState('connected'),
        url: socketUrl.toString(),
    });

    const headers = async () => {
        const token = await getClerkSessionToken();
        return {
            [appProtocolHeaders.productVersion]: productVersion,
            [appProtocolHeaders.protocolVersion]: String(appProtocolVersion),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
    };
    return {
        // The socket alone, for re-authenticating it in place (`session.refresh`).
        socketClient: createTRPCClient<HausRouter>({ links: [wsLink({ client: wsClient })] }),
        client: hausTrpc.createClient({
            links: [
                splitLink({
                    condition: (operation) => operation.type === 'subscription',
                    // Batched: a screen's concurrent queries share one POST, so a cold
                    // chat open costs one round trip. A slow operation
                    // (`context.skipBatch`) gets its own request so it never holds a batch.
                    false: splitLink({
                        condition: (operation) => operation.context.skipBatch === true,
                        false: httpBatchLink({ headers, methodOverride: 'POST', url: httpUrl }),
                        true: httpLink({ headers, methodOverride: 'POST', url: httpUrl }),
                    }),
                    true: wsLink({ client: wsClient }),
                }),
            ],
        }),
        wsClient,
    };
}

interface HausConnection {
    client: ReturnType<typeof hausTrpc.createClient>;
    socketClient: ReturnType<typeof createTRPCClient<HausRouter>>;
    wsClient: TRPCWebSocketClient;
}

/**
 * Hands a rotated token to the open socket. A socket that is not open, or that
 * drops mid-call, needs nothing: its next connection reads the current token
 * from its params. Only the Server refusing the token rejects.
 */
async function refreshHausSession(connection: HausConnection, token: string) {
    if (connection.wsClient.connection?.state !== 'open') {
        return;
    }
    try {
        await connection.socketClient.session.refresh.mutate({ clerkSessionToken: token });
    } catch (error) {
        if (error instanceof TRPCClientError && error.data?.code) {
            throw error;
        }
    }
}

/** Re-authenticate the transport without replacing its tRPC or React providers. */
function reconnectHausSession(wsClient: TRPCWebSocketClient) {
    wsClient.connection?.ws?.close();
}

export function useHausServerConnectionState() {
    return React.use(HausServerConnectionContext);
}
