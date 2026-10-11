import { createMCPClient } from '@ai-sdk/mcp';
import { skoolHostedUrl } from '../hosted-mcp/catalog.ts';
import { hostedMcpFetch } from '../hosted-mcp/transport.ts';
import { McpReconnectRequiredError } from './errors.ts';
import { createMcpOAuthProvider } from './oauth.ts';
import { mcpRequestHeaders } from './preset-headers.ts';
import type { McpRuntime } from './runtime.ts';
import { secureMcpFetch } from './secure-fetch.ts';

export async function createConnectionClient(
    runtime: McpRuntime,
    connectionId: string,
    signal: AbortSignal
) {
    const connection = await runtime.readConnection(connectionId);
    const secret = await runtime.readSecret(connectionId);
    return await createMCPClient({
        clientName: 'Haus Server',
        initializationOptions: { signal },
        transport: {
            authProvider:
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
                    : undefined,
            fetch:
                connection.preset === 'skool' && connection.url === skoolHostedUrl
                    ? hostedMcpFetch(runtime.hostedMcps, 'skool')
                    : secureMcpFetch,
            headers: mcpRequestHeaders(connection.preset, secret.headers),
            redirect: 'error',
            type: connection.preset === 'coingecko' ? 'sse' : 'http',
            url: connection.url,
        },
    });
}
