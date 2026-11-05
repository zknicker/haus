import { afterEach, describe, expect, test } from 'bun:test';
import dns from 'node:dns';
import { BLOCKED_MESSAGE, SCHEME_MESSAGE, safeFetch } from './safe-remote-fetch.ts';

const originalLookup = dns.promises.lookup;
const originalFetch = globalThis.fetch;
afterEach(() => {
    dns.promises.lookup = originalLookup;
    globalThis.fetch = originalFetch;
});

function stubLookup(records: Array<{ address: string; family: number }>): void {
    dns.promises.lookup = (() => Promise.resolve(records)) as unknown as typeof dns.promises.lookup;
}

const allow = { allowPrivateNetworks: false };
const allowPrivate = { allowPrivateNetworks: true };
const label = 'MCP and OAuth request';

function neverFetch(): { called: () => boolean } {
    let called = false;
    globalThis.fetch = (async () => {
        called = true;
        return new Response();
    }) as unknown as typeof fetch;
    return { called: () => called };
}

describe('safeFetch', () => {
    test('rejects a hostname that resolves to loopback without calling fetch', async () => {
        stubLookup([{ address: '127.0.0.1', family: 4 }]);
        const fetchSpy = neverFetch();

        await expect(
            safeFetch('https://private.example/mcp', undefined, label, allow)
        ).rejects.toThrow(BLOCKED_MESSAGE);
        expect(fetchSpy.called()).toBe(false);
    });

    test('rejects a redirect that points at a loopback address before the second hop fetches', async () => {
        let fetchCalls = 0;
        globalThis.fetch = (async () => {
            fetchCalls += 1;
            return Response.redirect('https://127.0.0.1/secrets', 302);
        }) as unknown as typeof fetch;

        await expect(safeFetch('https://1.1.1.1/mcp', undefined, label, allow)).rejects.toThrow(
            BLOCKED_MESSAGE
        );
        expect(fetchCalls).toBe(1);
    });

    test('rejects an IPv4-mapped IPv6 loopback literal in the URL itself', async () => {
        const fetchSpy = neverFetch();

        await expect(
            safeFetch('https://[::ffff:127.0.0.1]/', undefined, label, allow)
        ).rejects.toThrow(BLOCKED_MESSAGE);
        expect(fetchSpy.called()).toBe(false);
    });

    test('rejects a decimal-integer IP literal that URL canonicalizes to loopback', async () => {
        const fetchSpy = neverFetch();

        await expect(safeFetch('http://2130706433/', undefined, label, allow)).rejects.toThrow(
            SCHEME_MESSAGE
        );
        expect(fetchSpy.called()).toBe(false);
    });

    test('allows a public HTTPS URL and fetches the pinned address with the expected headers', async () => {
        let capturedUrl: unknown;
        let capturedInit: (RequestInit & { tls?: { serverName: string } }) | undefined;
        globalThis.fetch = (async (url: unknown, init: unknown) => {
            capturedUrl = url;
            capturedInit = init as typeof capturedInit;
            return new Response('ok', { status: 200 });
        }) as unknown as typeof fetch;

        const response = await safeFetch('https://1.1.1.1/mcp', undefined, label, allow);

        expect(await response.text()).toBe('ok');
        expect(String(capturedUrl)).toBe('https://1.1.1.1/mcp');
        expect((capturedInit?.headers as Headers).get('host')).toBe('1.1.1.1');
        expect(capturedInit?.tls?.serverName).toBe('1.1.1.1');
    });

    test('allows the same private-IP hostname once allowPrivateNetworks is true', async () => {
        stubLookup([{ address: '127.0.0.1', family: 4 }]);
        let fetchCalls = 0;
        globalThis.fetch = (async () => {
            fetchCalls += 1;
            return new Response('ok', { status: 200 });
        }) as unknown as typeof fetch;

        const response = await safeFetch(
            'https://private.example/mcp',
            undefined,
            label,
            allowPrivate
        );

        expect(await response.text()).toBe('ok');
        expect(fetchCalls).toBe(1);
    });
});
