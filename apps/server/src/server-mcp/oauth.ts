import type {
    OAuthAuthorizationServerInformation,
    OAuthClientInformation,
    OAuthClientMetadata,
    OAuthClientProvider,
    OAuthTokens,
} from '@ai-sdk/mcp';
import { auth } from '@ai-sdk/mcp';
import { configuredOAuthClient, configuredOAuthClientInformation } from './oauth-clients.ts';
import type { McpRuntime, McpSecret } from './runtime.ts';
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
            fetchFn: secureMcpFetch,
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
    input: { code: string; connectionId: string; redirectUrl: string; state: string }
): Promise<void> {
    const connection = await requireOAuthConnection(runtime, input.connectionId);
    const provider = await createMcpOAuthProvider(runtime, input.connectionId, input.redirectUrl, {
        allowAuthorizationServerOrigin: false,
        onRedirect() {
            throw new Error('The MCP server requested a new authorization flow.');
        },
    });
    const result = await auth(provider, {
        authorizationCode: input.code,
        callbackState: input.state,
        fetchFn: secureMcpFetch,
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
): Promise<OAuthClientProvider> {
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
        authorizationServerInformation: () =>
            secret.authorizationServerInformation as
                | OAuthAuthorizationServerInformation
                | undefined,
        async clientInformation() {
            if (secret.configuredClientInformation) {
                return secret.configuredClientInformation as OAuthClientInformation;
            }
            // A Server-owned preset client is read fresh, never copied onto the
            // connection, so a rotated secret reaches existing connections.
            if (configured) {
                return configuredOAuthClientInformation(configured);
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
                    : connection.preset === 'merchbase'
                      ? { scope: 'openid profile email' }
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
            options.onRedirect(url);
        },
        async saveAuthorizationServerInformation(value) {
            validateAuthorizationServerInformation(value);
            await update({
                authorizationServerInformation: value as unknown as Record<string, unknown>,
            });
        },
        async saveClientInformation(value) {
            await update({ clientInformation: value as unknown as Record<string, unknown> });
        },
        async saveCodeVerifier(verifier) {
            await update({ verifier });
        },
        async saveState(state) {
            await update({ oauthState: state });
        },
        async saveTokens(tokens) {
            await update({ tokens: tokens as unknown as Record<string, unknown> });
        },
        async state() {
            return options.routingState ?? crypto.randomUUID();
        },
        async storedState() {
            return secret.oauthState;
        },
        async tokens() {
            return secret.tokens as OAuthTokens | undefined;
        },
        async validateAuthorizationServerURL(_serverUrl, authorizationServerUrl) {
            await trustOrigin(new URL(authorizationServerUrl));
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
                ...(scope === 'client' ? { clientInformation: undefined } : {}),
                ...(scope === 'tokens' ? { tokens: undefined } : {}),
                ...(scope === 'verifier' ? { verifier: undefined } : {}),
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

function validateAuthorizationServerInformation(value: OAuthAuthorizationServerInformation) {
    for (const endpoint of [value.authorizationServerUrl, value.tokenEndpoint]) {
        if (endpoint) {
            assertSecureOrLoopbackUrl(endpoint, 'OAuth authorization server endpoint');
        }
    }
}
