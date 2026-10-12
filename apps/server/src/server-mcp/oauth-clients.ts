import type { McpPreset } from '@haus/api';
import type { OAuthClientInformation } from '@modelcontextprotocol/client';

/**
 * A Server-owned OAuth client for a preset whose authorization server offers no
 * dynamic client registration. Every Haus Server is a tenant of haus.chat, so
 * one registered client with the haus.chat callback serves them all.
 */
export interface ConfiguredOAuthClient {
    /** Authorization-server origins trusted without an operator prompt. */
    authorizationServerOrigins: readonly string[];
    clientIdVariable: string;
    clientSecretVariable: string;
    label: string;
    /** Undefined for a GitHub App, which ignores OAuth scopes. */
    scope: string | undefined;
    /**
     * Send `scope` even when the resource advertises `scopes_supported`; the
     * MCP client otherwise requests every advertised scope.
     */
    scopeOverridesResource: boolean;
    /** Advertised client metadata only; the MCP client picks the method from server metadata. */
    tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post';
}

const configuredOAuthClients: Partial<Record<McpPreset, ConfiguredOAuthClient>> = {
    // The Haus GitHub App's user sign-in (specs/github-app-connection.md#sign-in).
    // GitHub's metadata lists no token endpoint auth methods, so the MCP client
    // posts the secret in the form body, which GitHub's token endpoint expects.
    // A GitHub App's user token is the App's permissions intersected with the
    // user's access; GitHub ignores any `scope` the MCP client forwards.
    github: {
        authorizationServerOrigins: ['https://github.com'],
        clientIdVariable: 'HAUS_GITHUB_APP_CLIENT_ID',
        clientSecretVariable: 'HAUS_GITHUB_APP_CLIENT_SECRET',
        label: 'GitHub',
        scope: undefined,
        scopeOverridesResource: false,
        tokenEndpointAuthMethod: 'client_secret_post',
    },
    'google-calendar': {
        authorizationServerOrigins: [
            'https://accounts.google.com',
            'https://oauth2.googleapis.com',
        ],
        clientIdVariable: 'HAUS_GOOGLE_OAUTH_CLIENT_ID',
        clientSecretVariable: 'HAUS_GOOGLE_OAUTH_CLIENT_SECRET',
        label: 'Google Calendar',
        scope: 'https://www.googleapis.com/auth/calendar',
        scopeOverridesResource: false,
        tokenEndpointAuthMethod: 'client_secret_basic',
    },
};

export function configuredOAuthClient(preset: McpPreset | null): ConfiguredOAuthClient | undefined {
    return preset ? configuredOAuthClients[preset] : undefined;
}

/** Reads the client from the Server environment; throws when it is not configured. */
export function configuredOAuthClientInformation(
    client: ConfiguredOAuthClient
): OAuthClientInformation {
    const clientId = process.env[client.clientIdVariable]?.trim();
    const clientSecret = process.env[client.clientSecretVariable]?.trim();
    if (!(clientId && clientSecret)) {
        throw new Error(`The Haus Server ${client.label} OAuth client is unavailable.`);
    }
    return { client_id: clientId, client_secret: clientSecret };
}
