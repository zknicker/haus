import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { McpPreset } from '@haus/api';
import { createMcpOAuthProvider, startMcpAuthorization } from './oauth.ts';
import { emptySecret, type McpRuntime, type McpSecret } from './runtime.ts';

const redirectUrl = 'https://haus.chat/mcp/oauth/callback';
const githubMcpUrl = 'https://api.githubcopilot.com/mcp/';
const githubScope = 'repo read:org read:user user:email notifications gist project';
const clientVariables = [
    'HAUS_GITHUB_OAUTH_CLIENT_ID',
    'HAUS_GITHUB_OAUTH_CLIENT_SECRET',
    'HAUS_GOOGLE_OAUTH_CLIENT_ID',
    'HAUS_GOOGLE_OAUTH_CLIENT_SECRET',
] as const;

const savedEnvironment = new Map(clientVariables.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

beforeEach(() => {
    process.env.HAUS_GITHUB_OAUTH_CLIENT_ID = 'github-client';
    process.env.HAUS_GITHUB_OAUTH_CLIENT_SECRET = 'github-secret';
    process.env.HAUS_GOOGLE_OAUTH_CLIENT_ID = 'google-client';
    process.env.HAUS_GOOGLE_OAUTH_CLIENT_SECRET = 'google-secret';
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of savedEnvironment) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe('configured OAuth clients', () => {
    test('GitHub presents the Server client with post auth and its scope', async () => {
        const provider = await createMcpOAuthProvider(
            fakeRuntime('github', githubMcpUrl),
            'mcp_github',
            redirectUrl,
            { allowAuthorizationServerOrigin: false, onRedirect() {} }
        );
        expect(await provider.clientInformation()).toEqual({
            client_id: 'github-client',
            client_secret: 'github-secret',
        });
        expect(provider.clientMetadata).toMatchObject({
            scope: githubScope,
            token_endpoint_auth_method: 'client_secret_post',
        });
        await expect(
            provider.validateAuthorizationServerURL?.(
                githubMcpUrl,
                'https://github.com/login/oauth'
            )
        ).resolves.toBeUndefined();
    });

    test('Google Calendar keeps its client, basic auth, and trusted origins', async () => {
        const provider = await createMcpOAuthProvider(
            fakeRuntime('google-calendar', 'https://calendarmcp.googleapis.com/mcp/v1'),
            'mcp_calendar',
            redirectUrl,
            { allowAuthorizationServerOrigin: false, onRedirect() {} }
        );
        expect(await provider.clientInformation()).toEqual({
            client_id: 'google-client',
            client_secret: 'google-secret',
        });
        expect(provider.clientMetadata).toMatchObject({
            scope: 'https://www.googleapis.com/auth/calendar',
            token_endpoint_auth_method: 'client_secret_basic',
        });
        await expect(
            provider.validateAuthorizationServerURL?.(
                'https://calendarmcp.googleapis.com/mcp/v1',
                'https://accounts.google.com'
            )
        ).resolves.toBeUndefined();
    });

    test('a missing GitHub client reports the connection unavailable', async () => {
        process.env.HAUS_GITHUB_OAUTH_CLIENT_SECRET = '';
        const provider = await createMcpOAuthProvider(
            fakeRuntime('github', githubMcpUrl),
            'mcp_github',
            redirectUrl,
            { allowAuthorizationServerOrigin: false, onRedirect() {} }
        );
        await expect(provider.clientInformation()).rejects.toThrow(
            'The Haus Server GitHub OAuth client is unavailable.'
        );
    });

    test('an existing connection uses a rotated Server client and never stores it', async () => {
        const runtime = fakeRuntime('github', githubMcpUrl, {
            ...emptySecret(),
            // Cached by builds that copied the preset client onto the connection.
            clientInformation: { client_id: 'github-client', client_secret: 'stale-secret' },
            tokens: { access_token: 'gho_old', token_type: 'bearer' },
        });
        const options = { allowAuthorizationServerOrigin: false, onRedirect() {} };
        const before = await createMcpOAuthProvider(runtime, 'mcp_github', redirectUrl, options);
        expect(await before.clientInformation()).toEqual({
            client_id: 'github-client',
            client_secret: 'github-secret',
        });

        process.env.HAUS_GITHUB_OAUTH_CLIENT_SECRET = 'rotated-secret';
        const after = await createMcpOAuthProvider(runtime, 'mcp_github', redirectUrl, options);
        expect(await after.clientInformation()).toEqual({
            client_id: 'github-client',
            client_secret: 'rotated-secret',
        });
        await after.saveTokens({ access_token: 'gho_new', token_type: 'bearer' });
        expect(JSON.stringify(runtime.storedSecret())).not.toContain('rotated-secret');
        expect(runtime.storedSecret().configuredClientInformation).toBeUndefined();
    });

    test('a fresh sign-in leaves the Server client off the stored secret', async () => {
        globalThis.fetch = githubDiscoveryFetch();
        const runtime = fakeRuntime('github', githubMcpUrl);
        await startMcpAuthorization(runtime, {
            allowAuthorizationServerOrigin: false,
            connectionId: 'mcp_github',
            redirectUrl,
            routingState: 'state-1',
        });
        expect(runtime.storedSecret().clientInformation).toBeUndefined();
        expect(JSON.stringify(runtime.storedSecret())).not.toContain('github-secret');
    });

    test('GitHub sign-in requests the Haus scope instead of every advertised scope', async () => {
        globalThis.fetch = githubDiscoveryFetch();
        const result = await startMcpAuthorization(fakeRuntime('github', githubMcpUrl), {
            allowAuthorizationServerOrigin: false,
            connectionId: 'mcp_github',
            redirectUrl,
            routingState: 'state-1',
        });
        if (result.status !== 'ready') {
            throw new Error(`Expected a ready authorization, got ${result.status}.`);
        }
        const url = new URL(result.authorizationUrl);
        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(url.searchParams.get('client_id')).toBe('github-client');
        expect(url.searchParams.get('scope')).toBe(githubScope);
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('redirect_uri')).toBe(redirectUrl);
    });
});

function fakeRuntime(
    preset: McpPreset,
    url: string,
    initial: McpSecret = emptySecret()
): McpRuntime & { storedSecret(): McpSecret } {
    let secret = initial;
    return {
        readConnection: async () => ({ auth: 'oauth', preset, url }),
        readSecret: async () => secret,
        storedSecret: () => secret,
        writeSecret: async (_id: string, next: McpSecret) => {
            secret = next;
        },
    } as unknown as McpRuntime & { storedSecret(): McpSecret };
}

/** GitHub's published discovery documents, trimmed to the fields the flow reads. */
function githubDiscoveryFetch(): typeof fetch {
    const documents: Record<string, unknown> = {
        'https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp': {
            authorization_servers: ['https://github.com/login/oauth'],
            resource: 'https://api.githubcopilot.com/mcp',
            scopes_supported: ['repo', 'read:org', 'write:packages', 'gist', 'notifications'],
        },
        'https://github.com/.well-known/oauth-authorization-server/login/oauth': {
            authorization_endpoint: 'https://github.com/login/oauth/authorize',
            code_challenge_methods_supported: ['S256'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            issuer: 'https://github.com/login/oauth',
            response_types_supported: ['code'],
            token_endpoint: 'https://github.com/login/oauth/access_token',
        },
    };
    return (async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        const document = documents[url];
        return document ? Response.json(document) : new Response('Not Found', { status: 404 });
    }) as typeof fetch;
}
