import type {
    FetchLike,
    OAuthClientInformation,
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthDiscoveryState,
    OAuthTokens,
} from '@modelcontextprotocol/client';
import { auth } from '@modelcontextprotocol/client';
import type { McpSecret } from './connection-secret.ts';
import { configuredOAuthClient, configuredOAuthClientInformation } from './oauth-clients.ts';
import type { McpRuntime } from './runtime.ts';
import { assertSecureOrLoopbackUrl, secureMcpFetch } from './secure-fetch.ts';

export type McpOAuthStartResult =
    | { authorizationUrl: string; status: 'ready' }
    | { authorizationServerOrigin: string; status: 'trust-required' };

class AuthorizationOriginError extends Error {
    constructor(readonly origin: string) {
        super(`Confirm ${origin} before continuing.`);
    }
}

export async function startMcpAuthorization(
    runtime: McpRuntime,
    input: {
        allowAuthorizationServerOrigin: boolean;
        connectionId: string;
        redirectUrl: string;
        routingState: string;
    }
): Promise<McpOAuthStartResult> {
    const connection = await requireOAuthConnection(runtime, input.connectionId);
    assertSecureOrLoopbackUrl(input.redirectUrl, 'OAuth redirect');
    const existing = await runtime.readSecret(input.connectionId);
    await runtime.writeSecret(input.connectionId, {
        ...existing,
        oauthState: undefined,
        redirectUrl: input.redirectUrl,
        tokens: undefined,
        verifier: undefined,
    });
    let authorizationUrl: string | null = null;
    const provider = await createMcpOAuthProvider(runtime, input.connectionId, input.redirectUrl, {
        allowAuthorizationServerOrigin: input.allowAuthorizationServerOrigin,
        onRedirect(url) {
            authorizationUrl = url.toString();
        },
        routingState: input.routingState,
    });
    try {
        const configured = configuredOAuthClient(connection.preset);
        const result = await auth(provider, {
            fetchFn: provider.fetch,
            ...(configured?.scopeOverridesResource ? { scope: configured.scope } : {}),
            serverUrl: connection.url,
        });
        if (result !== 'REDIRECT' || !authorizationUrl) {
            throw new Error('The MCP authorization server did not return an authorization URL.');
        }
        return { authorizationUrl, status: 'ready' };
    } catch (cause) {
        if (cause instanceof AuthorizationOriginError) {
            await runtime.writeSecret(input.connectionId, {
                ...existing,
                approvedAuthorizationServerOrigins: (await runtime.readSecret(input.connectionId))
                    .approvedAuthorizationServerOrigins,
            });
            return { authorizationServerOrigin: cause.origin, status: 'trust-required' };
        }
        await runtime.writeSecret(input.connectionId, existing);
        throw cause;
    }
}

export async function completeMcpAuthorization(
    runtime: McpRuntime,
    input: { code: string; connectionId: string; redirectUrl: string; state: string; iss?: string }
): Promise<void> {
    const connection = await requireOAuthConnection(runtime, input.connectionId);
    const provider = await createMcpOAuthProvider(runtime, input.connectionId, input.redirectUrl, {
        allowAuthorizationServerOrigin: false,
        onRedirect() {
            throw new Error('The MCP server requested a new authorization flow.');
        },
    });
    if ((await runtime.readSecret(input.connectionId)).oauthState !== input.state) {
        throw new Error('MCP OAuth state does not match the authorization attempt.');
    }
    const result = await auth(provider, {
        authorizationCode: input.code,
        iss: input.iss,
        fetchFn: provider.fetch,
        serverUrl: connection.url,
    });
    if (result !== 'AUTHORIZED') {
        throw new Error('MCP authorization did not complete.');
    }
}

export async function createMcpOAuthProvider(
    runtime: McpRuntime,
    connectionId: string,
    redirectUrl: string,
    options: {
        allowAuthorizationServerOrigin: boolean;
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
        secret = { ...secret, ...patch };
        await runtime.writeSecret(connectionId, secret);
    };
    const trustOrigin = async (url: URL) => {
        assertSecureOrLoopbackUrl(url.toString(), 'OAuth authorization server');
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
                assertSecureOrLoopbackUrl(endpoint, 'OAuth credential endpoint');
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
        async saveCodeVerifier(verifier) {
            await update({ verifier });
        },

        async saveTokens(tokens) {
            await update({ tokens: tokens as unknown as Record<string, unknown> });
        },
        async state() {
            const state = options.routingState ?? crypto.randomUUID();
            await update({ oauthState: state });
            return state;
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
                ...(scope === 'tokens' ? { tokens: undefined } : {}),
                ...(scope === 'verifier' ? { verifier: undefined } : {}),
                ...(scope === 'discovery' ? { discoveryState: undefined } : {}),
            });
        },
    };
}

async function requireOAuthConnection(runtime: McpRuntime, connectionId: string) {
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
