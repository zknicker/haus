import { afterEach, describe, expect, test } from 'bun:test';
import { exchangeAuthorization } from '@modelcontextprotocol/client';
import { CrossOriginRedirectError, safeFetch } from './safe-remote-fetch.ts';

const allowLoopback = { allowPrivateNetworks: true };
const label = 'MCP and OAuth request';
const fakeSecret = 'fake-client-secret';
const fakeCode = 'fake-authorization-code';

interface Received {
    authorization: null | string;
    body: string;
    contentType: null | string;
    method: string;
    path: string;
}

const servers: Array<ReturnType<typeof Bun.serve>> = [];
afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

function startOrigin(redirect?: { location: (origin: string) => string; status: number }) {
    const received: Received[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        async fetch(request) {
            const url = new URL(request.url);
            received.push({
                authorization: request.headers.get('authorization'),
                body: await request.text(),
                contentType: request.headers.get('content-type'),
                method: request.method,
                path: url.pathname,
            });
            if (redirect && url.pathname === '/token') {
                return new Response(null, {
                    headers: { location: redirect.location(url.origin) },
                    status: redirect.status,
                });
            }
            return Response.json({ access_token: 'fake-access-token', token_type: 'bearer' });
        },
        port: 0,
    });
    servers.push(server);
    const origin = `http://127.0.0.1:${server.port}`;
    return { origin, received };
}

function tokenPost() {
    return {
        body: new URLSearchParams({
            client_secret: fakeSecret,
            code: fakeCode,
            grant_type: 'authorization_code',
        }),
        method: 'POST',
    } satisfies RequestInit;
}

describe('safeFetch redirect replay', () => {
    test.each([307, 308])('refuses a cross-origin %i with a body', async (status) => {
        const target = startOrigin();
        const source = startOrigin({ location: () => `${target.origin}/steal?code=x`, status });

        const error = await safeFetch(
            `${source.origin}/token?state=s`,
            tokenPost(),
            label,
            allowLoopback
        )
            .then(() => null)
            .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CrossOriginRedirectError);
        expect(error).toMatchObject({ fromOrigin: source.origin, status, toOrigin: target.origin });
        expect((error as Error).message).toBe(
            `MCP and OAuth request: refused a ${status} redirect from ${source.origin} to ${target.origin} because it would resend the request body to another origin.`
        );
        expect(target.received).toEqual([]);
    });

    test('follows a cross-origin 307 for an authenticated GET without forwarding Authorization', async () => {
        const target = startOrigin();
        const source = startOrigin({ location: () => `${target.origin}/mcp`, status: 307 });

        const response = await safeFetch(
            `${source.origin}/token`,
            { headers: { authorization: 'Bearer fake-token' } },
            label,
            allowLoopback
        );

        expect(response.status).toBe(200);
        expect(source.received[0]?.authorization).toBe('Bearer fake-token');
        expect(target.received).toEqual([
            { authorization: null, body: '', contentType: null, method: 'GET', path: '/mcp' },
        ]);
    });

    test('follows a cross-origin 307 for a GET without credentials', async () => {
        const target = startOrigin();
        const source = startOrigin({ location: () => `${target.origin}/icon.png`, status: 307 });

        const response = await safeFetch(`${source.origin}/token`, undefined, label, allowLoopback);

        expect(response.status).toBe(200);
        expect(target.received).toEqual([
            { authorization: null, body: '', contentType: null, method: 'GET', path: '/icon.png' },
        ]);
    });

    test('follows a same-origin 307 and resends the method and body', async () => {
        const source = startOrigin({ location: (origin) => `${origin}/token/v2`, status: 307 });

        const response = await safeFetch(
            `${source.origin}/token`,
            tokenPost(),
            label,
            allowLoopback
        );

        expect(response.status).toBe(200);
        expect(source.received.map(({ method, path }) => `${method} ${path}`)).toEqual([
            'POST /token',
            'POST /token/v2',
        ]);
        expect(source.received[1]?.body).toBe(tokenPost().body.toString());
    });

    test.each([302, 303])('follows a cross-origin %i as a GET with no body', async (status) => {
        const target = startOrigin();
        const source = startOrigin({ location: () => `${target.origin}/done`, status });

        const response = await safeFetch(
            `${source.origin}/token`,
            tokenPost(),
            label,
            allowLoopback
        );

        expect(response.status).toBe(200);
        expect(target.received).toEqual([
            { authorization: null, body: '', contentType: null, method: 'GET', path: '/done' },
        ]);
    });
});

describe('OAuth token exchange through safeFetch', () => {
    test('a token endpoint that 307s cross-origin never forwards the code or secret', async () => {
        const target = startOrigin();
        const source = startOrigin({ location: () => `${target.origin}/token`, status: 307 });

        await expect(
            exchangeAuthorization(source.origin, {
                authorizationCode: fakeCode,
                clientInformation: { client_id: 'fake-client', client_secret: fakeSecret },
                codeVerifier: 'fake-verifier',
                fetchFn: (input, init) => safeFetch(input, init, label, allowLoopback),
                redirectUri: 'https://haus.example/mcp/oauth/callback',
            })
        ).rejects.toBeInstanceOf(CrossOriginRedirectError);
        expect(source.received.map(({ method, path }) => `${method} ${path}`)).toEqual([
            'POST /token',
        ]);
        expect(source.received[0]?.body).toContain(`code=${fakeCode}`);
        expect(target.received).toEqual([]);
    });
});
