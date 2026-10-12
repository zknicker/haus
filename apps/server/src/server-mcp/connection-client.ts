import type { EffectRuntime } from '@haus/effect';
import {
    Client,
    SSEClientTransport,
    StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import type { Scope } from 'effect';
import { skoolHostedUrl } from '../hosted-mcp/catalog.ts';
import { hostedMcpFetch } from '../hosted-mcp/transport.ts';
import { McpReconnectRequiredError } from './errors.ts';
import { createMcpOAuthProvider } from './oauth.ts';
import { mcpRequestHeaders } from './preset-headers.ts';
import type { McpRuntime } from './runtime.ts';
import { secureMcpFetch } from './secure-fetch.ts';
import { maintainToolSubscription } from './tool-subscription.ts';

export async function createConnectionClient(
    runtime: McpRuntime,
    connectionId: string,
    signal: AbortSignal,
    lifecycle: { runtime: EffectRuntime<never>; scope: Scope.CloseableScope }
) {
    const connection = await runtime.readConnection(connectionId);
    const secret = await runtime.readSecret(connectionId);
    const provider =
        connection.auth === 'oauth'
            ? await createMcpOAuthProvider(
                  runtime,
                  connectionId,
                  secret.redirectUrl ?? 'http://127.0.0.1/mcp/oauth/callback',
                  {
                      allowAuthorizationServerOrigin: false,
                      onRedirect() {
                          throw new McpReconnectRequiredError();
                      },
                  }
              )
            : undefined;
    const client = new Client(
        { name: 'Haus Server', version: '1.0.0' },
        {
            versionNegotiation: { mode: 'auto' },
            listMaxPages: 100,
            defaultCacheTtlMs: 300_000,
            listChanged: {
                tools: {
                    autoRefresh: true,
                    debounceMs: 100,
                    onChanged(error, tools) {
                        if (signal.aborted) {
                            return;
                        }
                        if (error) {
                            runtime.inventoryFailed(connectionId, error);
                            return;
                        }
                        if (tools) {
                            void runtime.inventory
                                .record(
                                    connectionId,
                                    tools,
                                    () =>
                                        !signal.aborted && runtime.ownsClient(connectionId, client)
                                )
                                .catch((cause) => runtime.inventoryFailed(connectionId, cause));
                        }
                    },
                },
            },
        }
    );
    const options = {
        authProvider: provider,
        requestInit: {
            headers: mcpRequestHeaders(connection.preset, secret.headers),
            redirect: 'error' as const,
        },
        fetch:
            connection.preset === 'skool' && connection.url === skoolHostedUrl
                ? hostedMcpFetch(runtime.hostedMcps, 'skool')
                : (provider?.fetch ?? secureMcpFetch),
    };
    const url = new URL(connection.url);
    const transport =
        connection.preset === 'coingecko'
            ? new SSEClientTransport(url, options)
            : new StreamableHTTPClientTransport(url, options);
    try {
        await client.connect(transport, { signal, timeout: 5000 });
        if (
            client.getNegotiatedProtocolVersion() === '2026-07-28' &&
            client.getServerCapabilities()?.tools?.listChanged
        ) {
            await maintainToolSubscription(
                client,
                signal,
                () => runtime.inventory.refresh(connectionId),
                (cause) => runtime.inventoryFailed(connectionId, cause),
                lifecycle
            );
        }
        return client;
    } catch (cause) {
        await client.close();
        throw cause;
    }
}
