import { afterEach, describe, expect, test } from 'bun:test';
import { secureMcpFetch } from './secure-fetch.ts';

const tokenUrl = 'https://github.com/login/oauth/access_token';
const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('secureMcpFetch token responses', () => {
    test('a 200 OAuth error from a token endpoint becomes a 400 with the same body', async () => {
        const body = { error: 'bad_verification_code', error_description: 'The code is wrong.' };
        respondWith(Response.json(body));
        const response = await secureMcpFetch(tokenUrl, tokenRequest());
        expect(response.status).toBe(400);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(await response.json()).toEqual(body);
    });

    test('a 200 token success passes through with its body intact', async () => {
        const body = { access_token: 'gho_token', scope: 'repo', token_type: 'bearer' };
        respondWith(Response.json(body));
        const response = await secureMcpFetch(tokenUrl, tokenRequest());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(body);
    });

    test('a non-JSON 200 token response passes through unchanged', async () => {
        respondWith(new Response('access_token=gho_token&token_type=bearer', { status: 200 }));
        const response = await secureMcpFetch(tokenUrl, tokenRequest());
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('access_token=gho_token&token_type=bearer');
    });

    test('a non-token request carrying an error field is untouched', async () => {
        const body = {
            error: { code: -32_601, message: 'Method not found' },
            id: 1,
            jsonrpc: '2.0',
        };
        const upstream = Response.json(body);
        respondWith(upstream);
        const response = await secureMcpFetch('https://api.githubcopilot.com/mcp/', {
            body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list' }),
            method: 'POST',
        });
        expect(response).toBe(upstream);
        expect(await response.json()).toEqual(body);
    });

    test('rejects insecure remote URLs before fetching', async () => {
        let called = false;
        globalThis.fetch = (async () => {
            called = true;
            return new Response();
        }) as unknown as typeof fetch;
        await expect(secureMcpFetch('http://example.com/token', tokenRequest())).rejects.toThrow(
            'must use HTTPS or loopback HTTP'
        );
        expect(called).toBe(false);
    });
});

function tokenRequest(): RequestInit {
    return {
        body: new URLSearchParams({ code: 'code-1', grant_type: 'authorization_code' }),
        method: 'POST',
    };
}

function respondWith(response: Response): void {
    globalThis.fetch = (async () => response) as unknown as typeof fetch;
}
