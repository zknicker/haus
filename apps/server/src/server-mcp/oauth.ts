import type {
    FetchLike,
    OAuthClientInformation,
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthDiscoveryState,
    OAuthTokens,
} from '@modelcontextprotocol/client';
import { env } from '../config/env.ts';
import type { McpSecret } from './connection-secret.ts';
import { configuredOAuthClient, configuredOAuthClientInformation } from './oauth-clients.ts';
import type { McpRuntime } from './runtime.ts';
import { assertSecureOrLoopbackUrl, secureMcpFetch } from './secure-fetch.ts';

/** An authorization-server origin the operator has not approved yet. */
export class AuthorizationOriginError extends Error {
    constructor(readonly origin: string) {
        super(`Confirm ${origin} before continuing.`);
    }
}

export async function createMcpOAuthProvider(
    runtime: McpRuntime,
    connectionId: string,
    redirectUrl: string,
    options: {
        allowAuthorizationServerOrigin: boolean;
        /**
         * A sign-in in progress never drops the working tokens: a rejected code
         * or re-registered client leaves them for the callback to replace.
         */
        keepTokens?: boolean;
        onRedirect(url: URL): void;
        routingState?: string;
    }
): Promise<OAuthClientProvider & { fetch: FetchLike }> {
    const connection = await requireOAuthConnection(runtime, connectionId);
    const configured = configuredOAuthClient(connection.preset);
    let secret = await runtime.readSecret(connectionId);
    const trustedOrigins = new Set([
        ...(configured?.authorizationServerOrigins ?? []),
        ...secret.approvedAuthorizationServerOrigins,
    ]);
    let approvalAvailable = options.allowAuthorizationServerOrigin;
    const update = async (patch: Partial<McpSecret>) => {
        // A sign-in runs beside the live client on the same row; writing a stale
        // copy would drop the other's PKCE state or refreshed tokens.
        secret = { ...(await runtime.readSecret(connectionId)), ...patch };
        await runtime.writeSecret(connectionId, secret);
    };
    const trustOrigin = async (url: URL) => {
        assertSecureOrLoopbackUrl(url.toString(), 'OAuth authorization server', {
            allowPrivateNetworks: env.HAUS_MCP_ALLOW_PRIVATE_NETWORKS,
        });
        if (trustedOrigins.has(url.origin)) {
            return;
        }
        if (!approvalAvailable) {
            throw new AuthorizationOriginError(url.origin);
        }
        approvalAvailable = false;
        trustedOrigins.add(url.origin);
        await update({
            approvedAuthorizationServerOrigins: [
                ...new Set([...secret.approvedAuthorizationServerOrigins, url.origin]),
            ],
        });
    };

    return {
        discoveryState: () => secret.discoveryState as unknown as OAuthDiscoveryState | undefined,
        fetch: async (input, init) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            const discovery = secret.discoveryState as unknown as OAuthDiscoveryState | undefined;
            const trustedDiscovery =
                discovery && trustedOrigins.has(new URL(discovery.authorizationServerUrl).origin);
            const declaredEndpoint =
                trustedDiscovery && oauthCredentialEndpoints(discovery).includes(url.href);
            if (url.origin !== new URL(connection.url).origin && !declaredEndpoint) {
                await trustOrigin(url);
            }
            return await secureMcpFetch(input, init);
        },
        async clientInformation() {
            if (secret.configuredClientInformation) {
                return {
                    ...(secret.configuredClientInformation as OAuthClientInformation),
                    ...(secret.clientInformationIssuer
                        ? { issuer: secret.clientInformationIssuer }
                        : {}),
                };
            }
            // A Server-owned preset client is read fresh, never copied onto the
            // connection, so a rotated secret reaches existing connections.
            if (configured) {
                return {
                    ...configuredOAuthClientInformation(configured),
                    ...(secret.clientInformationIssuer
                        ? { issuer: secret.clientInformationIssuer }
                        : {}),
                };
            }
            return secret.clientInformation as OAuthClientInformation | undefined;
        },
        get clientMetadata(): OAuthClientMetadata {
            const configuredSecret = secret.configuredClientInformation?.client_secret;
            return {
                client_name: 'Haus',
                client_uri: 'https://haus.chat',
                grant_types: ['authorization_code', 'refresh_token'],
                redirect_uris: [redirectUrl],
                response_types: ['code'],
                ...(configured
                    ? { scope: configured.scope }
                    : secret.oauthScopes.length > 0
                      ? { scope: secret.oauthScopes.join(' ') }
                      : {}),
                token_endpoint_auth_method:
                    configured?.tokenEndpointAuthMethod ??
                    (typeof configuredSecret === 'string' ? 'client_secret_basic' : 'none'),
            };
        },
        async codeVerifier() {
            if (!secret.verifier) {
                throw new Error('MCP OAuth verifier was not found.');
            }
            return secret.verifier;
        },
        get redirectUrl() {
            return redirectUrl;
        },
        async redirectToAuthorization(url) {
            await trustOrigin(url);
            // A configured client without a scope (the GitHub App) sends none,
            // not the resource's advertised classic scopes.
            if (configured && configured.scope === undefined) {
                url.searchParams.delete('scope');
            }
            options.onRedirect(url);
        },
        async saveDiscoveryState(value) {
            await trustOrigin(new URL(value.authorizationServerUrl));
            for (const endpoint of oauthCredentialEndpoints(value)) {
                assertSecureOrLoopbackUrl(endpoint, 'OAuth credential endpoint', {
                    allowPrivateNetworks: env.HAUS_MCP_ALLOW_PRIVATE_NETWORKS,
                });
            }
            await update({ discoveryState: value as unknown as Record<string, unknown> });
        },
        async saveClientInformation(value) {
            if (configured || secret.configuredClientInformation) {
                await update({ clientInformationIssuer: value.issuer });
            } else {
                await update({ clientInformation: value as unknown as Record<string, unknown> });
            }
        },
        // Only a sign-in (which brings routing state) persists PKCE state. The
        // live client cannot finish a browser flow and must not overwrite one.
        async saveCodeVerifier(verifier) {
            if (options.routingState) {
                await update({ verifier });
            }
        },

        async saveTokens(tokens) {
            await update({ tokens: tokens as unknown as Record<string, unknown> });
        },
        async state() {
            if (!options.routingState) {
                return crypto.randomUUID();
            }
            await update({ oauthState: options.routingState });
            return options.routingState;
        },

        async tokens() {
            // Re-read per request: the GitHub connection refreshes its user
            // token outside this client (github/user-token.ts), and GitHub
            // rotates the refresh token on every use.
            secret = await runtime.readSecret(connectionId);
            return secret.tokens as OAuthTokens | undefined;
        },

        async validateResourceURL(serverUrl, resource) {
            const expected = new URL(serverUrl);
            const actual = new URL(resource ?? expected);
            if (actual.origin !== expected.origin) {
                throw new Error('The MCP resource indicator must match the server origin.');
            }
            return actual;
        },
        async invalidateCredentials(scope) {
            if (scope === 'all') {
                secret = {
                    approvedAuthorizationServerOrigins: secret.approvedAuthorizationServerOrigins,
                    configuredClientInformation: secret.configuredClientInformation,
                    headers: secret.headers,
                    oauthScopes: secret.oauthScopes,
                    redirectUrl: secret.redirectUrl,
                };
                await runtime.writeSecret(connectionId, secret);
                return;
            }
            await update({
                ...(scope === 'client'
                    ? { clientInformation: undefined, clientInformationIssuer: undefined }
                    : {}),
                ...(scope === 'tokens' && !options.keepTokens ? { tokens: undefined } : {}),
                ...(scope === 'verifier' ? { verifier: undefined } : {}),
                ...(scope === 'discovery' ? { discoveryState: undefined } : {}),
            });
        },
    };
}

export async function requireOAuthConnection(runtime: McpRuntime, connectionId: string) {
    const connection = await runtime.readConnection(connectionId);
    if (connection.auth !== 'oauth') {
        throw new Error('This MCP connection does not use OAuth.');
    }
    return connection;
}

function oauthCredentialEndpoints(state: OAuthDiscoveryState): string[] {
    const metadata = state.authorizationServerMetadata;
    return [metadata?.token_endpoint, metadata?.registration_endpoint]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => new URL(value).href);
}
