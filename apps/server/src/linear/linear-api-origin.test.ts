import { afterAll, beforeAll, expect, test } from 'bun:test';
import { linearTransport } from './linear-api-origin.ts';

let server: ReturnType<typeof Bun.serve>;
const seen: string[] = [];

beforeAll(() => {
    server = Bun.serve({
        fetch: (request) => {
            seen.push(new URL(request.url).pathname);
            return Response.json({ ok: true });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
});

afterAll(() => {
    server.stop(true);
});

test('without an origin the transport is global fetch', () => {
    expect(linearTransport(undefined)).toBe(fetch);
});

test('api.linear.app requests go to the loopback origin, path and query kept', async () => {
    const transport = linearTransport(`http://127.0.0.1:${server.port}`);
    const response = await transport('https://api.linear.app/graphql?x=1', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(seen).toEqual(['/graphql']);
});

test('a non-loopback origin is refused', () => {
    expect(() => linearTransport('https://example.com')).toThrow(/loopback/u);
});
