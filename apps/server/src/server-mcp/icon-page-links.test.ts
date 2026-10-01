import { afterAll, describe, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { iconPageMaxCandidates, parsePageIconLinks } from './icon-page-links.ts';
import { type McpIconFetch, makeMcpIconResolver } from './icons.ts';

// Its own runtime: `icon-test-resolver.ts` disposes a module-shared one after
// the first file that imports it, which would break a second file in the run.
const runtime = makeTestRuntime();
afterAll(async () => {
    await runtime.dispose();
});
const resolveMcpIcon = makeMcpIconResolver(runtime);

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const pngDataUrl = `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`;
const pageUrl = 'https://example.com/';
// An SPA answers every path with its shell, `/favicon.ico` included.
const spaShell = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;

function siteFetch(routes: Record<string, () => Response>): {
    fetchImpl: McpIconFetch;
    urls: string[];
} {
    const urls: string[] = [];
    return {
        fetchImpl: (url) => {
            urls.push(url);
            const route = routes[url];
            return route ? Promise.resolve(route()) : Promise.reject(new Error('no route'));
        },
        urls,
    };
}

const html = (body: string) => () =>
    new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 });
const png = () => () =>
    new Response(pngBytes as unknown as BodyInit, {
        headers: { 'content-type': 'image/png' },
        status: 200,
    });

async function resolveSite(fetchImpl: McpIconFetch) {
    return await resolveMcpIcon({
        connectionUrl: 'https://mcp.example.com/mcp',
        fetchImpl,
        serverInfoIcons: undefined,
        timeoutMs: 50,
    });
}

describe('parsePageIconLinks', () => {
    test('reads icon, shortcut icon, and apple-touch-icon links in any attribute order', () => {
        const links = parsePageIconLinks(
            spaShell(`
                <link href="/favicon-32.png" rel="icon" type="image/png" sizes="32x32">
                <LINK REL='shortcut icon' HREF='static/fav.ico'>
                <link rel=apple-touch-icon href=/apple.png>
                <link rel="stylesheet" href="/app.css">
                <link rel="mask-icon" href="/mask.svg">
            `),
            pageUrl
        );

        expect(links).toEqual([
            { mimeType: 'image/png', sizes: ['32x32'], src: 'https://example.com/favicon-32.png' },
            { src: 'https://example.com/static/fav.ico' },
            { sizes: ['180x180'], src: 'https://example.com/apple.png' },
        ]);
    });

    test('drops links off the page origin or over plaintext', () => {
        const links = parsePageIconLinks(
            spaShell(`
                <link rel="icon" href="https://cdn.tracker.example/i.png">
                <link rel="icon" href="//evil.example/i.png">
                <link rel="icon" href="http://example.com/i.png">
            `),
            pageUrl
        );

        expect(links).toEqual([]);
    });

    test('ignores links outside the head', () => {
        const page = `<html><head></head><body><link rel="icon" href="/late.png"></body></html>`;

        expect(parsePageIconLinks(page, pageUrl)).toEqual([]);
    });

    test('marks an SVG href so ranking never requests it', () => {
        const [link] = parsePageIconLinks(spaShell('<link rel="icon" href="/i.svg?v=2">'), pageUrl);

        expect(link?.mimeType).toBe('image/svg+xml');
    });

    test('decodes entities in an href', () => {
        const [link] = parsePageIconLinks(
            spaShell('<link rel="icon" href="/i.png?a=1&amp;b=2">'),
            pageUrl
        );

        expect(link?.src).toBe('https://example.com/i.png?a=1&b=2');
    });
});

describe('page link fallback', () => {
    test('finds the icon an SPA names when its favicon.ico is the HTML shell', async () => {
        const shell = spaShell(`
            <link rel="icon" type="image/svg+xml" href="/logo.svg">
            <link rel="icon" type="image/png" sizes="16x16" href="/icon-16.png">
            <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        `);
        const { fetchImpl, urls } = siteFetch({
            'https://example.com/': html(shell),
            'https://example.com/apple-touch-icon.png': png(),
            'https://example.com/favicon.ico': html(shell),
        });

        const icon = await resolveSite(fetchImpl);

        expect(icon).toEqual({ dark: null, light: pngDataUrl });
        // The SVG costs no request; the retina-sized apple-touch-icon beats 16px.
        expect(urls).toEqual([
            'https://example.com/favicon.ico',
            'https://example.com/',
            'https://example.com/apple-touch-icon.png',
        ]);
    });

    test('falls through a candidate whose bytes are not an image', async () => {
        const { fetchImpl } = siteFetch({
            'https://example.com/': html(
                spaShell(
                    '<link rel="icon" sizes="64x64" href="/a.png"><link rel="icon" sizes="16x16" href="/b.png">'
                )
            ),
            'https://example.com/a.png': html('<html></html>'),
            'https://example.com/b.png': png(),
        });

        expect((await resolveSite(fetchImpl))?.light).toBe(pngDataUrl);
    });

    test('never reads a home page that is not HTML', async () => {
        const { fetchImpl, urls } = siteFetch({
            'https://example.com/': () =>
                new Response('<link rel="icon" href="/i.png">', {
                    headers: { 'content-type': 'text/plain' },
                }),
            'https://example.com/i.png': png(),
        });

        expect(await resolveSite(fetchImpl)).toBeNull();
        expect(urls).not.toContain('https://example.com/i.png');
    });

    test('bounds how many page candidates it requests', async () => {
        const links = Array.from(
            { length: 10 },
            (_, index) => `<link rel="icon" href="/i${index}.png">`
        ).join('');
        const { fetchImpl, urls } = siteFetch({ 'https://example.com/': html(spaShell(links)) });

        expect(await resolveSite(fetchImpl)).toBeNull();
        // favicon.ico, the page, then the capped candidates.
        expect(urls).toHaveLength(2 + iconPageMaxCandidates);
    });

    test('skips the page entirely when favicon.ico is a real icon', async () => {
        const { fetchImpl, urls } = siteFetch({ 'https://example.com/favicon.ico': png() });

        expect((await resolveSite(fetchImpl))?.light).toBe(pngDataUrl);
        expect(urls).toEqual(['https://example.com/favicon.ico']);
    });
});
