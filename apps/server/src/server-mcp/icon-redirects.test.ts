import { afterAll, describe, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { fetchMcpIcon } from './icon-fetch.ts';
import { type McpIconFetch, makeMcpIconResolver } from './icons.ts';

const runtime = makeTestRuntime();
afterAll(async () => {
    await runtime.dispose();
});
const resolveIcon = makeMcpIconResolver(runtime);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const pngDataUrl = `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`;
const png = () => new Response(pngBytes, { headers: { 'content-type': 'image/png' } });

function routes(responses: Record<string, () => Response>) {
    const urls: string[] = [];
    const fetchImpl: McpIconFetch = (url) => {
        urls.push(url);
        return Promise.resolve(responses[url]?.() ?? new Response(null, { status: 404 }));
    };
    return { fetchImpl, urls };
}

describe('icon redirects', () => {
    test('resolves a Cloudflare-style favicon redirect to www', async () => {
        const { fetchImpl, urls } = routes({
            'https://cloudflare.com/favicon.ico': () =>
                Response.redirect('https://www.cloudflare.com/favicon.ico', 301),
            'https://www.cloudflare.com/favicon.ico': () =>
                new Response(pngBytes, {
                    headers: { 'content-type': 'image/vnd.microsoft.icon' },
                }),
        });
        const icon = await resolveIcon({
            connectionUrl: 'https://mcp.cloudflare.com/mcp',
            fetchImpl,
            serverInfoIcons: [],
            timeoutMs: 100,
        });
        expect(icon).toEqual({ dark: null, light: pngDataUrl });
        expect(urls).toEqual([
            'https://cloudflare.com/favicon.ico',
            'https://www.cloudflare.com/favicon.ico',
        ]);
    });

    test('resolves relative homepage links against the final canonical page', async () => {
        const { fetchImpl, urls } = routes({
            'https://example.com/': () => Response.redirect('https://www.example.com/brand/', 302),
            'https://www.example.com/brand/': () =>
                new Response('<head><link rel="icon" href="mark.png"></head>', {
                    headers: { 'content-type': 'text/html' },
                }),
            'https://www.example.com/brand/mark.png': png,
        });
        const icon = await resolveIcon({
            connectionUrl: 'https://mcp.example.com/mcp',
            fetchImpl,
            preferPageIcon: true,
            serverInfoIcons: [],
            timeoutMs: 100,
        });
        expect(icon).toEqual({ dark: null, light: pngDataUrl });
        expect(urls).toEqual([
            'https://example.com/',
            'https://www.example.com/brand/',
            'https://www.example.com/brand/mark.png',
        ]);
    });

    test('follows a relative redirect and the reverse www canonicalization', async () => {
        const { fetchImpl, urls } = routes({
            'https://www.example.com/favicon.ico': () =>
                new Response(null, { status: 307, headers: { location: '/icon.png' } }),
            'https://www.example.com/icon.png': () =>
                Response.redirect('https://example.com/icon.png', 308),
            'https://example.com/icon.png': png,
        });
        const result = await fetchMcpIcon(
            fetchImpl,
            'https://www.example.com/favicon.ico',
            new AbortController().signal
        );
        expect(result.response.ok).toBe(true);
        expect(result.url).toBe('https://example.com/icon.png');
        expect(urls).toHaveLength(3);
    });

    test.each([
        'https://evil.example/icon.png',
        'https://example.com.evil.example/icon.png',
        'https://cdn.example.com/icon.png',
        'https://www.www.example.com/icon.png',
        'https://127.0.0.1/icon.png',
        'http://example.com/icon.png',
        'https://example.com:8443/icon.png',
        'https://user:secret@example.com/icon.png',
    ])('never requests an unsafe redirect to %s', async (destination) => {
        let cancelled = false;
        const { fetchImpl, urls } = routes({
            'https://example.com/favicon.ico': () =>
                new Response(
                    new ReadableStream({
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { status: 302, headers: { location: destination } }
                ),
        });
        const result = await fetchMcpIcon(
            fetchImpl,
            'https://example.com/favicon.ico',
            new AbortController().signal
        );
        expect(result.response.ok).toBe(false);
        expect(urls).toEqual(['https://example.com/favicon.ico']);
        expect(cancelled).toBe(true);
    });

    test('stops redirect loops after three hops', async () => {
        const { fetchImpl, urls } = routes({
            'https://example.com/favicon.ico': () =>
                Response.redirect('https://www.example.com/favicon.ico', 302),
            'https://www.example.com/favicon.ico': () =>
                Response.redirect('https://example.com/favicon.ico', 302),
        });
        const result = await fetchMcpIcon(
            fetchImpl,
            'https://example.com/favicon.ico',
            new AbortController().signal
        );
        expect(result.response.ok).toBe(false);
        expect(urls).toHaveLength(4);
    });
});
