import { auth } from '@modelcontextprotocol/client';
import { env } from '../config/env.ts';
import {
    AuthorizationOriginError,
    createMcpOAuthProvider,
    requireOAuthConnection,
} from './oauth.ts';
import { configuredOAuthClient } from './oauth-clients.ts';
import type { McpRuntime } from './runtime.ts';
import { assertSecureOrLoopbackUrl } from './secure-fetch.ts';

export type McpOAuthStartResult =
    | { authorizationUrl: string; status: 'ready' }
    | { authorizationServerOrigin: string; status: 'trust-required' };

/**
 * Starts a browser sign-in. Nothing the connection works with changes here:
 * its tokens stay until the callback replaces them, so an abandoned sign-in
 * leaves a working connection working.
 */
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
    assertSecureOrLoopbackUrl(input.redirectUrl, 'OAuth redirect', {
        allowPrivateNetworks: env.HAUS_MCP_ALLOW_PRIVATE_NETWORKS,
    });
    const existing = await runtime.readSecret(input.connectionId);
    await runtime.writeSecret(input.connectionId, {
        ...existing,
        oauthState: undefined,
        redirectUrl: input.redirectUrl,
        verifier: undefined,
    });
    let authorizationUrl: string | null = null;
    const provider = await createMcpOAuthProvider(runtime, input.connectionId, input.redirectUrl, {
        allowAuthorizationServerOrigin: input.allowAuthorizationServerOrigin,
        keepTokens: true,
        onRedirect(url) {
            authorizationUrl = url.toString();
        },
        routingState: input.routingState,
    });
    try {
        const configured = configuredOAuthClient(connection.preset);
        const result = await auth(provider, {
            fetchFn: provider.fetch,
            // Stored tokens would otherwise be refreshed, returning no authorization URL.
            forceReauthorization: true,
            ...(configured?.scopeOverridesResource ? { scope: configured.scope } : {}),
            serverUrl: connection.url,
        });
        if (result !== 'REDIRECT' || !authorizationUrl) {
            throw new Error('The MCP authorization server did not return an authorization URL.');
        }
        return { authorizationUrl, status: 'ready' };
    } catch (cause) {
        // Undo this attempt, keeping any tokens the live client refreshed meanwhile.
        const current = await runtime.readSecret(input.connectionId);
        const restored = { ...existing, tokens: current.tokens };
        if (cause instanceof AuthorizationOriginError) {
            await runtime.writeSecret(input.connectionId, {
                ...restored,
                approvedAuthorizationServerOrigins: current.approvedAuthorizationServerOrigins,
            });
            return { authorizationServerOrigin: cause.origin, status: 'trust-required' };
        }
        await runtime.writeSecret(input.connectionId, restored);
        throw cause;
    }
}

/** Exchanges the callback code; a failed exchange keeps the tokens the connection had. */
export async function completeMcpAuthorization(
    runtime: McpRuntime,
    input: { code: string; connectionId: string; redirectUrl: string; state: string; iss?: string }
): Promise<void> {
    const connection = await requireOAuthConnection(runtime, input.connectionId);
    const provider = await createMcpOAuthProvider(runtime, input.connectionId, input.redirectUrl, {
        allowAuthorizationServerOrigin: false,
        keepTokens: true,
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
