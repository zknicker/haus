import { appProtocolHeaders, appProtocolVersion } from '@haus/api';
import {
    createTRPCClient,
    createWSClient,
    httpLink,
    splitLink,
    type TRPCClient,
    wsLink,
} from '@trpc/client';
import { WebSocket } from 'ws';
import type { HausRouter } from '../src/haus-api/router.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

/**
 * Speaks the same wire the App speaks: HTTP for queries and mutations, the
 * tRPC WebSocket for subscriptions, with the Haus access token attached
 * exactly as the App attaches it.
 */
export interface HausClient {
    close(): void;
    sessionToken: string | null;
    trpc: TRPCClient<HausRouter>;
}

export interface HausClientOptions {
    /** Declared App protocol version; defaults to the exact current version. */
    protocolVersion?: number;
}

export function createHausClient(
    harness: HausServerHarness,
    sessionToken: string | null = null,
    options: HausClientOptions = {}
): HausClient {
    const declaredProtocolVersion = options.protocolVersion ?? appProtocolVersion;
    const httpUrl = new URL('/trpc', harness.url).toString();
    const socketUrl = new URL('/trpc', harness.url);

    socketUrl.protocol = 'ws:';

    const wsClient = createWSClient({
        WebSocket: createOriginWebSocket(harness.appOrigin),
        connectionParams: () => ({
            appProtocolVersion: String(declaredProtocolVersion),
            ...(sessionToken ? { sessionToken } : {}),
            productVersion: 'test',
        }),
        url: socketUrl.toString(),
    });
    const headers = () => ({
        [appProtocolHeaders.productVersion]: 'test',
        [appProtocolHeaders.protocolVersion]: String(declaredProtocolVersion),
        ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    });

    return {
        sessionToken,
        close: () => wsClient.close(),
        trpc: createTRPCClient<HausRouter>({
            links: [
                splitLink({
                    condition: (operation) => operation.type === 'subscription',
                    false: httpLink({ headers, methodOverride: 'POST', url: httpUrl }),
                    true: wsLink({ client: wsClient }),
                }),
            ],
        }),
    };
}

export function createOriginWebSocket(origin: string) {
    return class extends WebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols, { headers: { Origin: origin } });
        }
    } as unknown as typeof globalThis.WebSocket;
}
