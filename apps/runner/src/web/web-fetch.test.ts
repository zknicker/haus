import { afterAll, describe, expect, test } from 'bun:test';
import { isPublicAddress } from './public-address.ts';
import { webFetch } from './web-fetch.ts';

const page = `<!doctype html>
<html><head><title>Field notes</title><style>body { color: red; }</style></head>
<body>
<h1>Field notes</h1>
<p>Read the <a href="/guide">guide</a> first.</p>
<script>track()</script>
<ul><li>one</li><li>two</li></ul>
</body></html>`;

const server = Bun.serve({
    fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === '/page') {
            return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        if (pathname.startsWith('/hop/')) {
            const left = Number(pathname.slice('/hop/'.length));
            return Response.redirect(left === 0 ? '/page' : `/hop/${left - 1}`, 302);
        }
        if (pathname === '/to-metadata') {
            return Response.redirect('http://169.254.169.254/latest/meta-data', 302);
        }
        if (pathname === '/big') {
            return new Response(`${'x'.repeat(100)}\n${'y'.repeat(200)}`, {
                headers: { 'content-type': 'text/plain' },
            });
        }
        if (pathname === '/lines') {
            return new Response(
                Array.from({ length: 2500 }, (_, index) => `line ${index + 1}`).join('\n'),
                { headers: { 'content-type': 'text/plain' } }
            );
        }
        if (pathname === '/slow') {
            return new Promise<Response>(() => undefined);
        }
        if (pathname === '/pdf') {
            return new Response(new Uint8Array([37, 80, 68, 70, 0, 1, 2, 3]), {
                headers: { 'content-type': 'application/pdf' },
            });
        }
        if (pathname === '/notes.md') {
            return new Response('# Notes\n\nPlain **markdown**.', {
                headers: { 'content-type': 'text/markdown' },
            });
        }
        return new Response('gone', { status: 404 });
    },
    port: 0,
});

afterAll(() => server.stop(true));

const origin = `http://127.0.0.1:${server.port}`;
const loopbackAllowed = (address: string) => address === '127.0.0.1' || isPublicAddress(address);

function fetchText(url: string, limits?: Parameters<typeof webFetch>[0]['limits']) {
    return webFetch({
        limits,
        reachable: loopbackAllowed,
        signal: new AbortController().signal,
        url,
    });
}

describe('web_fetch', () => {
    test('HTML becomes Markdown with scripts and styles gone and links made absolute', async () => {
        expect(await fetchText(`${origin}/page`)).toEqual({
            content: [
                {
                    text: `Field notes\n\n# Field notes\n\nRead the [guide](${origin}/guide) first.\n\n*   one\n*   two`,
                    type: 'text',
                },
            ],
            isError: false,
        });
    });

    test('Markdown passes through as it is', async () => {
        expect(await fetchText(`${origin}/notes.md`)).toEqual({
            content: [{ text: '# Notes\n\nPlain **markdown**.', type: 'text' }],
            isError: false,
        });
    });

    test('five redirects are followed and a sixth is refused', async () => {
        const followed = await fetchText(`${origin}/hop/4`);
        const refused = await fetchText(`${origin}/hop/5`);

        expect(followed.content).toEqual([
            {
                text: `Redirected to ${origin}/page.\n\nField notes\n\n# Field notes\n\nRead the [guide](${origin}/guide) first.\n\n*   one\n*   two`,
                type: 'text',
            },
        ]);
        expect(refused).toEqual({
            content: [
                {
                    text: `${origin}/hop/5 redirected more than 5 times, so web_fetch stopped.`,
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('a private address is refused directly and behind a redirect', async () => {
        const direct = await webFetch({
            signal: new AbortController().signal,
            url: `${origin}/page`,
        });
        const redirected = await fetchText(`${origin}/to-metadata`);

        expect(direct.content).toEqual([
            {
                text: `${origin}/page resolves to 127.0.0.1, a private or local address, so web_fetch did not fetch it.`,
                type: 'text',
            },
        ]);
        expect(redirected).toEqual({
            content: [
                {
                    text: 'http://169.254.169.254/latest/meta-data resolves to 169.254.169.254, a private or local address, so web_fetch did not fetch it.',
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('a body past the size cap is read up to the cap and says so', async () => {
        expect(await fetchText(`${origin}/big`, { maxBodyBytes: 150 })).toEqual({
            content: [
                {
                    text: `${'x'.repeat(100)}\n${'y'.repeat(49)}\n\n[The page is larger than 150 B; web_fetch read only its first 150 B.]`,
                    type: 'text',
                },
            ],
            isError: false,
        });
    });

    test('the model sees the first 2,000 lines with a line naming the cut', async () => {
        const [part] = (await fetchText(`${origin}/lines`)).content;
        const text = part?.type === 'text' ? part.text : '';

        expect(text.split('\n').slice(1998)).toEqual([
            'line 1999',
            'line 2000',
            '',
            '[Showed lines 1-2000 of 2500; cut at the 2,000-line limit.]',
        ]);
    });

    test('a server that never answers ends at the time limit', async () => {
        expect(await fetchText(`${origin}/slow`, { timeoutMs: 50 })).toEqual({
            content: [
                {
                    text: `${origin}/slow did not finish within 0.05 seconds, so web_fetch stopped.`,
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('a stop aborts the fetch instead of answering', async () => {
        const stop = new AbortController();
        const fetching = webFetch({
            reachable: loopbackAllowed,
            signal: stop.signal,
            url: `${origin}/slow`,
        });
        stop.abort();

        await expect(fetching).rejects.toThrow();
    });

    test('a binary body is described by type and size, never shown', async () => {
        expect(await fetchText(`${origin}/pdf`)).toEqual({
            content: [
                {
                    text: `${origin}/pdf is application/pdf (8 B), not text, so web_fetch shows none of it.`,
                    type: 'text',
                },
            ],
            isError: false,
        });
    });

    test('a URL that is not http or https is refused', async () => {
        expect((await fetchText('file:///etc/passwd')).content).toEqual([
            { text: 'web_fetch reads only http and https URLs.', type: 'text' },
        ]);
    });

    test('an error status is marked as an error and still shows the page', async () => {
        expect(await fetchText(`${origin}/missing`)).toEqual({
            content: [{ text: 'The server answered HTTP 404.\n\ngone', type: 'text' }],
            isError: true,
        });
    });
});
