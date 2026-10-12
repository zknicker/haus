import { describe, expect, test } from 'bun:test';
import { mcpIconMaxBytes } from '@haus/api';
import {
    iconRequestInit,
    type McpIconFetch,
    resolveMcpIcon,
    siteFaviconUrl,
    summarizeInstructions,
} from './icon-test-resolver.ts';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const pngDataUrl = `data:image/png;base64,${Buffer.from(pngBytes).toString('base64')}`;
const icoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
const connectionUrl = 'https://mcp.example.com/mcp';
function respondWith(bytes: Uint8Array, mediaType: string): Response {
    return new Response(bytes as unknown as BodyInit, {
        headers: { 'content-type': mediaType },
        status: 200,
    });
}

function recordingFetch(handler: (url: string) => Response): {
    fetchImpl: McpIconFetch;
    urls: string[];
} {
    const urls: string[] = [];
    return {
        fetchImpl: (url) => {
            urls.push(url);
            return Promise.resolve(handler(url));
        },
        urls,
    };
}

const rejectAll: McpIconFetch = () => Promise.reject(new Error('no network'));

async function resolve(serverInfoIcons: unknown, fetchImpl: McpIconFetch = rejectAll) {
    return await resolveMcpIcon({ connectionUrl, fetchImpl, serverInfoIcons, timeoutMs: 50 });
}

describe('advertised icons', () => {
    test('inlines a data URI whose bytes match the declared type', async () => {
        const icon = await resolve([{ mimeType: 'image/png', src: pngDataUrl }]);

        // Untagged icons serve both themes, stored once.
        expect(icon).toEqual({ dark: null, light: pngDataUrl });
    });

    test('keeps light and dark variants apart', async () => {
        const dark = new Uint8Array([...pngBytes, 0x02]);
        const darkUrl = `data:image/png;base64,${Buffer.from(dark).toString('base64')}`;
        const icon = await resolve([
            { src: pngDataUrl, theme: 'light' },
            { src: darkUrl, theme: 'dark' },
        ]);

        expect(icon).toEqual({ dark: darkUrl, light: pngDataUrl });
    });

    test('stores a single-theme icon once and lets the App fall back', async () => {
        const icon = await resolve([{ src: pngDataUrl, theme: 'light' }]);

        expect(icon).toEqual({ dark: null, light: pngDataUrl });
    });

    test('rejects bytes that do not match the declared media type', async () => {
        const lying = `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`;

        expect(await resolve([{ src: lying }])).toBeNull();
    });

    test('rejects an oversized icon', async () => {
        const huge = new Uint8Array(mcpIconMaxBytes + 1);
        huge.set(pngBytes, 0);
        const src = `data:image/png;base64,${Buffer.from(huge).toString('base64')}`;

        expect(await resolve([{ src }])).toBeNull();
    });

    test('prefers the smallest icon that still covers a retina row', async () => {
        const big = new Uint8Array([...pngBytes, 0x03]);
        const bigUrl = `data:image/png;base64,${Buffer.from(big).toString('base64')}`;
        const icon = await resolve([
            { mimeType: 'image/png', sizes: ['16x16'], src: pngDataUrl },
            { mimeType: 'image/png', sizes: ['64x64'], src: bigUrl },
        ]);

        expect(icon?.light).toBe(bigUrl);
    });
});

describe('SVG', () => {
    // Refused by media type, so none of these depend on screening the markup.
    const markups: [string, string][] = [
        ['a plain icon', '<svg viewBox="0 0 1 1"/>'],
        ['a script', '<svg><script>alert(1)</script></svg>'],
        ['a slash-separated event handler', '<svg/onload="alert(1)"/>'],
        ['a single-quoted external reference', "<svg><image href='http://evil.example/x'/></svg>"],
        ['a protocol-relative reference', '<svg><image href="//evil.example/x"/></svg>'],
    ];

    for (const [label, markup] of markups) {
        test(`refuses an SVG carrying ${label}`, async () => {
            const src = `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;

            expect(await resolve([{ src }])).toBeNull();
        });
    }

    test('never requests an SVG the server declared', async () => {
        const { fetchImpl, urls } = recordingFetch(() => respondWith(pngBytes, 'image/png'));
        await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [
                { mimeType: 'image/svg+xml', src: 'https://mcp.example.com/icon.svg' },
            ],
            timeoutMs: 50,
        });

        // Dropped while ranking, so it costs no request at all.
        expect(urls).toEqual(['https://example.com/favicon.ico']);
    });
});

describe('fetch policy', () => {
    test('fetches an advertised icon on the connection origin', async () => {
        const { fetchImpl, urls } = recordingFetch(() => respondWith(pngBytes, 'image/png'));
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [{ src: 'https://mcp.example.com/icon.png' }],
            timeoutMs: 50,
        });

        expect(urls).toEqual(['https://mcp.example.com/icon.png']);
        expect(icon?.light).toBe(pngDataUrl);
    });

    test('refuses an icon hosted off the connection origin', async () => {
        const { fetchImpl, urls } = recordingFetch(() => respondWith(pngBytes, 'image/png'));
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [{ src: 'https://tracker.example/beacon.png' }],
            timeoutMs: 50,
        });

        // The tracker is never requested, so it learns nothing; resolution
        // falls through to the favicon on the connection's own site.
        expect(urls).toEqual(['https://example.com/favicon.ico']);
        expect(icon).toEqual({ dark: null, light: pngDataUrl });
    });

    test('refuses a plaintext icon URL', async () => {
        const { fetchImpl, urls } = recordingFetch(() => respondWith(pngBytes, 'image/png'));
        await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [{ src: 'http://mcp.example.com/icon.png' }],
            timeoutMs: 50,
        });

        expect(urls).not.toContain('http://mcp.example.com/icon.png');
    });

    test('falls back to the site favicon when nothing is advertised', async () => {
        const { fetchImpl, urls } = recordingFetch(() => respondWith(icoBytes, 'image/x-icon'));
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: undefined,
            timeoutMs: 50,
        });

        expect(urls).toEqual(['https://example.com/favicon.ico']);
        expect(icon?.light).toStartWith('data:image/x-icon;base64,');
    });

    test('stops reading a body that exceeds the cap', async () => {
        // Streamed in chunks with no content-length, so only the running total
        // can catch it — this is the unbounded-memory case.
        let delivered = 0;
        const chunk = new Uint8Array(16 * 1024);
        chunk.set(pngBytes, 0);
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                delivered += chunk.byteLength;
                if (delivered > mcpIconMaxBytes * 4) {
                    controller.close();
                    return;
                }
                controller.enqueue(chunk);
            },
        });
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl: () =>
                Promise.resolve(
                    new Response(body, {
                        headers: { 'content-type': 'image/png' },
                        status: 200,
                    })
                ),
            serverInfoIcons: [{ src: 'https://mcp.example.com/huge.png' }],
            timeoutMs: 200,
        });

        expect(icon).toBeNull();
        // Aborted rather than drained. The slack over the cap is the stream's
        // own read-ahead queue; what matters is that the producer never got to
        // deliver the whole oversized body.
        expect(delivered).toBeLessThan(mcpIconMaxBytes * 2);
    });

    test('refuses a body whose declared length exceeds the cap', async () => {
        const { fetchImpl } = recordingFetch(
            () =>
                new Response(pngBytes as unknown as BodyInit, {
                    headers: {
                        'content-length': String(mcpIconMaxBytes + 1),
                        'content-type': 'image/png',
                    },
                    status: 200,
                })
        );
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [{ src: 'https://mcp.example.com/icon.png' }],
            timeoutMs: 50,
        });

        expect(icon).toBeNull();
    });

    test('inspects redirects before following their destinations', () => {
        expect(iconRequestInit.redirect).toBe('manual');
    });

    test('discards a redirect response rather than chasing its target', async () => {
        const { fetchImpl } = recordingFetch(() =>
            Response.redirect('https://evil.example/x.png', 302)
        );
        const icon = await resolveMcpIcon({
            connectionUrl,
            fetchImpl,
            serverInfoIcons: [{ src: 'https://mcp.example.com/icon.png' }],
            timeoutMs: 50,
        });

        expect(icon).toBeNull();
    });

    test('survives a failing icon host', async () => {
        expect(
            await resolveMcpIcon({
                connectionUrl,
                fetchImpl: rejectAll,
                serverInfoIcons: [{ src: 'https://mcp.example.com/icon.png' }],
                timeoutMs: 50,
            })
        ).toBeNull();
    });
});

describe('siteFaviconUrl', () => {
    test.each([
        ['https://mcp.linear.app/mcp', 'https://linear.app/favicon.ico'],
        ['https://api.githubcopilot.com/mcp/', 'https://githubcopilot.com/favicon.ico'],
        ['https://example.com/mcp', 'https://example.com/favicon.ico'],
        // A public suffix must never be treated as the site.
        ['https://example.co.uk/mcp', 'https://example.co.uk/favicon.ico'],
        ['https://mcp.example.co.uk/mcp', 'https://example.co.uk/favicon.ico'],
    ])('%s -> %s', (url, expected) => {
        expect(siteFaviconUrl(url)).toBe(expected);
    });

    test.each(['http://mcp.example.com/mcp', 'not a url'])('refuses %s', (url) => {
        expect(siteFaviconUrl(url)).toBeNull();
    });
});

describe('summarizeInstructions', () => {
    test('keeps the opening line and drops the tool catalog under it', () => {
        // Shape taken from DeepWiki's real initialize response.
        const instructions = [
            'DeepWiki MCP provides AI-powered documentation for GitHub repositories.',
            '',
            'Available tools:',
            '- read_wiki_structure: Get a list of documentation topics',
            '- ask_question: Ask any question about a repository',
        ].join('\n');

        expect(summarizeInstructions(instructions)).toBe(
            'DeepWiki MCP provides AI-powered documentation for GitHub repositories.'
        );
    });

    test('skips leading blank lines', () => {
        expect(summarizeInstructions('\n\n  Real summary.  \nmore')).toBe('Real summary.');
    });

    test('truncates an opening line past the contract ceiling', () => {
        const summary = summarizeInstructions('x'.repeat(400));

        expect(summary).toHaveLength(200);
        expect(summary?.endsWith('…')).toBe(true);
    });

    test.each([undefined, null, '', '   \n  ', 42])('returns null for %p', (value) => {
        expect(summarizeInstructions(value)).toBeNull();
    });
});
