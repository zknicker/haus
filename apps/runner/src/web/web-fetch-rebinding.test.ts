import { afterAll, expect, test } from 'bun:test';
import { webFetch } from './web-fetch.ts';

const vetted = Bun.serve({
    fetch: (request) =>
        new Response(`vetted page for ${request.headers.get('host')}`, {
            headers: { 'content-type': 'text/plain' },
        }),
    hostname: '127.0.0.1',
    port: 0,
});
const loopbackHits: string[] = [];
const loopback = Bun.serve({
    fetch(request) {
        loopbackHits.push(request.url);
        return new Response('loopback secret', { headers: { 'content-type': 'text/plain' } });
    },
    hostname: '::1',
    port: vetted.port,
});

afterAll(() => {
    vetted.stop(true);
    loopback.stop(true);
});

test('a host that rebinds to loopback after the check is fetched from the vetted address only', async () => {
    const answers = [['127.0.0.1'], ['::1']];
    const lookups: string[] = [];
    const url = `http://localhost:${vetted.port}/notes`;

    const fetched = await webFetch({
        reachable: (address) => address === '127.0.0.1',
        resolve: (hostname) => {
            lookups.push(hostname);
            return Promise.resolve(answers.shift() ?? ['::1']);
        },
        signal: new AbortController().signal,
        url,
    });

    expect(fetched).toEqual({
        content: [{ text: `vetted page for localhost:${vetted.port}`, type: 'text' }],
        isError: false,
    });
    expect(lookups).toEqual(['localhost']);
    expect(loopbackHits).toEqual([]);
});
