import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { McpPreset } from '@haus/api';
import { emptySecret, type McpSecret } from './connection-secret.ts';
import { createMcpOAuthProvider, startMcpAuthorization } from './oauth.ts';
import type { McpRuntime } from './runtime.ts';

const redirectUrl = 'https://haus.chat/mcp/oauth/callback';
const githubMcpUrl = 'https://api.githubcopilot.com/mcp/';
const clientVariables = [
    'HAUS_GITHUB_APP_CLIENT_ID',
    'HAUS_GITHUB_APP_CLIENT_SECRET',
    'HAUS_GOOGLE_OAUTH_CLIENT_ID',
    'HAUS_GOOGLE_OAUTH_CLIENT_SECRET',
] as const;

const savedEnvironment = new Map(clientVariables.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

beforeEach(() => {
    process.env.HAUS_GITHUB_APP_CLIENT_ID = 'github-client';
    process.env.HAUS_GITHUB_APP_CLIENT_SECRET = 'github-secret';
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
    test.each([
        ['merchbase', 'https://app.merchbase.co/mcp'],
        ['rankwrangler', 'https://rankwrangler.merchbase.co/mcp'],
        ['merchbase-atlas', 'https://atlas.merchbase.co/mcp'],
        ['handmade', 'https://handmade.merchbase.co/mcp'],
        ['merchbase-fulfillment', 'https://fulfillment.merchbase.co/mcp/printful'],
        ['tmterminal', 'https://tmterminal.merchbase.co/mcp'],
    ] as const)('%s discovers OAuth without preset identity scopes', async (preset, url) => {
        const runtime = fakeRuntime(preset, url, {
            ...emptySecret(),
        });
        const provider = await createMcpOAuthProvider(runtime, 'mcp_fulfillment', redirectUrl, {
            allowAuthorizationServerOrigin: false,
            onRedirect() {},
        });
        expect(await provider.clientInformation()).toBeUndefined();
        expect(provider.clientMetadata.scope).toBeUndefined();
        expect(provider.clientMetadata).toMatchObject({
            redirect_uris: [redirectUrl],
            token_endpoint_auth_method: 'none',
        });
    });

    test('GitHub presents the App client with post auth and no scope', async () => {
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
            token_endpoint_auth_method: 'client_secret_post',
        });
        expect(provider.clientMetadata.scope).toBeUndefined();
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
    });

    test('a missing GitHub client reports the connection unavailable', async () => {
        process.env.HAUS_GITHUB_APP_CLIENT_SECRET = '';
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

        process.env.HAUS_GITHUB_APP_CLIENT_SECRET = 'rotated-secret';
        const after = await createMcpOAuthProvider(runtime, 'mcp_github', redirectUrl, options);
        expect(await after.clientInformation()).toEqual({
            client_id: 'github-client',
            client_secret: 'rotated-secret',
        });
        await after.saveTokens({ access_token: 'gho_new', token_type: 'bearer' });
        expect(JSON.stringify(runtime.storedSecret())).not.toContain('rotated-secret');
        expect(runtime.storedSecret().configuredClientInformation).toBeUndefined();
    });

    test('a live client sends the user token another writer refreshed', async () => {
        const runtime = fakeRuntime('github', githubMcpUrl, {
            ...emptySecret(),
            tokens: { access_token: 'ghu_old', refresh_token: 'ghr_old', token_type: 'bearer' },
        });
        const provider = await createMcpOAuthProvider(runtime, 'mcp_github', redirectUrl, {
            allowAuthorizationServerOrigin: false,
            onRedirect() {},
        });
        expect((await provider.tokens())?.access_token).toBe('ghu_old');
        await runtime.writeSecret('mcp_github', {
            ...runtime.storedSecret(),
            tokens: { access_token: 'ghu_new', refresh_token: 'ghr_new', token_type: 'bearer' },
        });
        expect(await provider.tokens()).toMatchObject({
            access_token: 'ghu_new',
            refresh_token: 'ghr_new',
        });
    });

    test('unapproved OAuth endpoints are rejected before any request leaves Server', async () => {
        let fetched = false;
        globalThis.fetch = ((_input: RequestInfo | URL) => {
            fetched = true;
            return Promise.resolve(Response.json({}));
        }) as typeof fetch;
        const provider = await createMcpOAuthProvider(
            fakeRuntime('merchbase', 'https://mcp.example.test/mcp'),
            'mcp_custom',
            redirectUrl,
            { allowAuthorizationServerOrigin: false, onRedirect() {} }
        );
        await expect(provider.fetch('https://unapproved.example.test/token')).rejects.toThrow(
            'Confirm https://unapproved.example.test'
        );
        expect(fetched).toBe(false);
        await expect(
            provider.redirectToAuthorization(new URL('https://unapproved.example.test/authorize'))
        ).rejects.toThrow('Confirm');
    });

    test('an approved authorization server may declare a separate HTTPS credential endpoint', async () => {
        let fetched = false;
        globalThis.fetch = ((_input: RequestInfo | URL) => {
            fetched = true;
            return Promise.resolve(Response.json({}));
        }) as typeof fetch;
        const runtime = fakeRuntime('merchbase', 'https://mcp.example.test/mcp', {
            ...emptySecret(),
            approvedAuthorizationServerOrigins: ['https://issuer.example.test'],
            discoveryState: {
                authorizationServerUrl: 'https://issuer.example.test',
                authorizationServerMetadata: {
                    token_endpoint: 'https://tokens.example.test/token',
                },
            },
        });
        const provider = await createMcpOAuthProvider(runtime, 'mcp_custom', redirectUrl, {
            allowAuthorizationServerOrigin: false,
            onRedirect() {},
        });
        await provider.fetch('https://tokens.example.test/token');
        expect(fetched).toBe(true);
        await expect(provider.fetch('https://tokens.example.test/unrelated')).rejects.toThrow(
            'Confirm'
        );
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
        expect(runtime.storedSecret().clientInformationIssuer).toBe(
            'https://github.com/login/oauth'
        );
        const provider = await createMcpOAuthProvider(runtime, 'mcp_github', redirectUrl, {
            allowAuthorizationServerOrigin: false,
            onRedirect() {},
        });
        expect(await provider.clientInformation()).toMatchObject({
            issuer: 'https://github.com/login/oauth',
        });
        expect(JSON.stringify(runtime.storedSecret())).not.toContain('github-secret');
    });

    test('GitHub sign-in sends the App client through PKCE to the Haus callback', async () => {
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
        // GitHub Apps have permissions, not scopes: the advertised classic scopes stay off.
        expect(url.searchParams.has('scope')).toBe(false);
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
