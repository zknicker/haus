import { appProtocolHeaders, appProtocolVersion } from '@haus/api/app-protocol';
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
import type { HausRouter } from '../../../server/src/haus-api/router.ts';

export type HausServerConnectionState = 'connected' | 'connecting' | 'reconnecting';

/** One tRPC client: queries and mutations over HTTP, subscriptions and socket calls over one socket. */
export interface HausConnection {
    client: ReturnType<typeof createTRPCClient<HausRouter>>;
    wsClient: TRPCWebSocketClient;
}

export interface HausConnectionOptions {
    onConnectionState: (state: HausServerConnectionState) => void;
    origin: string;
    productVersion: string;
    readAccessToken: () => Promise<string | null>;
    /** Tests only: a fake socket. */
    WebSocket?: typeof WebSocket;
}

// A PING after 15 s of socket silence; no PONG within 5 s closes the socket.
const socketKeepAlive = { enabled: true, intervalMs: 15_000, pongTimeoutMs: 5000 };

/**
 * Routes an operation over the socket instead of HTTP. Every socket operation
 * goes through the one client: the socket keys its requests by the client's
 * operation id, so a second client on the same socket reuses ids and its call
 * silently replaces (then deletes) a live subscription with the same id.
 */
const socketContext = { socket: true } as const;

/** One stable tRPC client whose websocket re-authenticates in place. */
export function createHausConnection({
    onConnectionState,
    origin,
    productVersion,
    readAccessToken,
    WebSocket,
}: HausConnectionOptions): HausConnection {
    const httpUrl = new URL('/trpc', origin).toString();
    const socketUrl = new URL('/trpc', origin);

    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const wsClient = createWSClient({
        connectionParams: async () => {
            const token = await readAccessToken();
            return {
                appProtocolVersion: String(appProtocolVersion),
                ...(token ? { sessionToken: token } : {}),
                productVersion,
            };
        },
        // A socket half-open after sleep or a network change never errors on
        // its own: its streams would sit silent. Without a PONG (the Server
        // adapter answers PING) it closes, and the normal reconnect recovers.
        keepAlive: socketKeepAlive,
        onClose: () => onConnectionState('reconnecting'),
        onOpen: () => onConnectionState('connected'),
        url: socketUrl.toString(),
        ...(WebSocket ? { WebSocket } : {}),
    });

    const headers = async () => {
        const token = await readAccessToken();
        return {
            [appProtocolHeaders.productVersion]: productVersion,
            [appProtocolHeaders.protocolVersion]: String(appProtocolVersion),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        };
    };
    return {
        client: createTRPCClient<HausRouter>({
            links: [
                splitLink({
                    condition: (operation) =>
                        operation.type === 'subscription' || operation.context.socket === true,
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

/**
 * Hands a rotated App access token to the open socket (`session.refresh`). A socket that
 * is not open, or that drops mid-call, needs nothing: its next connection
 * reads the current token from its params. Only the Server refusing the token
 * rejects.
 */
export async function refreshHausSession(connection: HausConnection, token: string) {
    if (connection.wsClient.connection?.state !== 'open') {
        return;
    }
    try {
        await connection.client.session.refresh.mutate(
            { sessionToken: token },
            { context: socketContext }
        );
    } catch (error) {
        if (error instanceof TRPCClientError && error.data?.code) {
            throw error;
        }
    }
}

/** Re-authenticate the transport without replacing its tRPC or React providers. */
export function reconnectHausSession(wsClient: TRPCWebSocketClient) {
    wsClient.connection?.ws?.close();
}
