import { afterEach, describe, expect, test } from 'bun:test';
import dns from 'node:dns';
import { BLOCKED_MESSAGE, safeFetch } from './safe-remote-fetch.ts';

// Connection-level fallback across a host's validated DNS answers, e.g. an
// IPv6-first answer on a machine with no IPv6 route. The real-socket version
// of the fallback lives in safe-remote-fetch-tls.test.ts.
const originalLookup = dns.promises.lookup;
const originalFetch = globalThis.fetch;
afterEach(() => {
    dns.promises.lookup = originalLookup;
    globalThis.fetch = originalFetch;
});

function stubLookup(records: Array<{ address: string; family: number }>): void {
    dns.promises.lookup = (() => Promise.resolve(records)) as unknown as typeof dns.promises.lookup;
}

function connectError(code: string): Error {
    return Object.assign(new TypeError(`${code}: Unable to connect`), { code });
}

const allow = { allowPrivateNetworks: false };
const label = 'MCP and OAuth request';
const v4 = { address: '104.18.24.159', family: 4 };
const v4b = { address: '104.18.25.159', family: 4 };
const v6 = { address: '2606:4700::6812:189f', family: 6 };

describe('safeFetch address fallback', () => {
    test('tries IPv4 addresses before IPv6 ones, whatever order DNS returned', async () => {
        stubLookup([v6, v4]);
        const attempted: string[] = [];
        globalThis.fetch = (async (url: unknown) => {
            attempted.push(String(url));
            return new Response('ok', { status: 200 });
        }) as unknown as typeof fetch;

        await safeFetch('https://mcp.example/mcp', undefined, label, allow);

        expect(attempted).toEqual(['https://104.18.24.159/mcp']);
    });

    test('falls back to the next validated address when the first is unreachable', async () => {
        stubLookup([v4, v6]);
        const attempts: Array<{
            init: RequestInit & { tls?: { serverName: string } };
            url: string;
        }> = [];
        globalThis.fetch = (async (url: unknown, init: unknown) => {
            attempts.push({ init: init as RequestInit, url: String(url) });
            if (attempts.length === 1) {
                throw connectError('EHOSTUNREACH');
            }
            return new Response('ok', { status: 200 });
        }) as unknown as typeof fetch;

        const response = await safeFetch(
            'https://mcp.example/mcp',
            { body: '{}', method: 'POST' },
            label,
            allow
        );

        expect(await response.text()).toBe('ok');
        expect(attempts.map((attempt) => attempt.url)).toEqual([
            'https://104.18.24.159/mcp',
            'https://[2606:4700::6812:189f]/mcp',
        ]);
        const retried = attempts[1].init;
        expect(retried.body).toBe('{}');
        expect((retried.headers as Headers).get('host')).toBe('mcp.example');
        expect(retried.tls?.serverName).toBe('mcp.example');
    });

    test("falls back on older Bun's FailedToOpenSocket code", async () => {
        stubLookup([v4, v4b]);
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            if (calls === 1) {
                throw connectError('FailedToOpenSocket');
            }
            return new Response('ok', { status: 200 });
        }) as unknown as typeof fetch;

        const response = await safeFetch('https://mcp.example/mcp', undefined, label, allow);

        expect(response.status).toBe(200);
        expect(calls).toBe(2);
    });

    test('throws the last connect error once every address has failed', async () => {
        stubLookup([v4, v6]);
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            throw connectError(calls === 1 ? 'ECONNREFUSED' : 'EHOSTUNREACH');
        }) as unknown as typeof fetch;

        await expect(
            safeFetch('https://mcp.example/mcp', undefined, label, allow)
        ).rejects.toMatchObject({ code: 'EHOSTUNREACH' });
        expect(calls).toBe(2);
    });

    test('does not fall back on an HTTP error response', async () => {
        stubLookup([v4, v4b]);
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return new Response('down', { status: 503 });
        }) as unknown as typeof fetch;

        const response = await safeFetch('https://mcp.example/mcp', undefined, label, allow);

        expect(response.status).toBe(503);
        expect(calls).toBe(1);
    });

    test('does not fall back on a TLS or other non-connect error', async () => {
        stubLookup([v4, v4b]);
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            throw connectError('ERR_TLS_CERT_ALTNAME_INVALID');
        }) as unknown as typeof fetch;

        await expect(
            safeFetch('https://mcp.example/mcp', undefined, label, allow)
        ).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
        expect(calls).toBe(1);
    });

    test('does not replay a stream body on another address', async () => {
        stubLookup([v4, v4b]);
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            throw connectError('ECONNREFUSED');
        }) as unknown as typeof fetch;

        await expect(
            safeFetch(
                'https://mcp.example/mcp',
                { body: new Blob(['{}']).stream(), method: 'POST' },
                label,
                allow
            )
        ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
        expect(calls).toBe(1);
    });

    test('rejects the whole lookup when any answer is blocked, even after a public one', async () => {
        stubLookup([v4, { address: '::1', family: 6 }]);
        let called = false;
        globalThis.fetch = (async () => {
            called = true;
            return new Response();
        }) as unknown as typeof fetch;

        await expect(safeFetch('https://mcp.example/mcp', undefined, label, allow)).rejects.toThrow(
            BLOCKED_MESSAGE
        );
        expect(called).toBe(false);
    });
});
