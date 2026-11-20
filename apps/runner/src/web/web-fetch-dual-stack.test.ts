import { afterAll, expect, test } from 'bun:test';
import { webFetch } from './web-fetch.ts';

const hits: string[] = [];
const ipv4 = Bun.serve({
    fetch(request) {
        hits.push(new URL(request.url).pathname);
        return new Response('reached over IPv4', { headers: { 'content-type': 'text/plain' } });
    },
    hostname: '127.0.0.1',
    port: 0,
});

afterAll(() => {
    ipv4.stop(true);
});

test('a host whose first address is unreachable IPv6 is still fetched over its IPv4 address', async () => {
    const fetched = await webFetch({
        reachable: (address) => address === '::1' || address === '127.0.0.1',
        resolve: () => Promise.resolve(['::1', '127.0.0.1']),
        signal: new AbortController().signal,
        url: `http://dual.example:${ipv4.port}/dual`,
    });

    expect(fetched).toEqual({
        content: [{ text: 'reached over IPv4', type: 'text' }],
        isError: false,
    });
    expect(hits).toEqual(['/dual']);
});

test('a host that resolves to a public and a private address is refused without a request', async () => {
    const fetched = await webFetch({
        reachable: (address) => address === '127.0.0.1',
        resolve: () => Promise.resolve(['127.0.0.1', '10.0.0.7']),
        signal: new AbortController().signal,
        url: `http://mixed.example:${ipv4.port}/mixed`,
    });

    expect(fetched).toEqual({
        content: [
            {
                text: `http://mixed.example:${ipv4.port}/mixed resolves to 10.0.0.7, a private or local address, so web_fetch did not fetch it.`,
                type: 'text',
            },
        ],
        isError: true,
    });
    expect(hits.filter((path) => path === '/mixed')).toEqual([]);
});
