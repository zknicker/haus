import { afterAll, describe, expect, test } from 'bun:test';
import * as z from 'zod';
import { type SearchBackend, webSearch } from './web-search.ts';

const server = Bun.serve({
    fetch(request) {
        const url = new URL(request.url);
        const query = url.searchParams.get('q') ?? '';
        const count = Number(url.searchParams.get('count'));
        if (query === 'nothing') {
            return Response.json({ results: [] });
        }
        if (query === 'broken') {
            return new Response('upstream down', { status: 502 });
        }
        const snippet = query === 'huge' ? 'word '.repeat(4000) : 'Ships every Tuesday.';
        return Response.json({
            results: Array.from({ length: count }, (_, index) => ({
                age: index === 0 ? '2026-11-01' : undefined,
                description: snippet,
                title: `Result ${index + 1}`,
                url: `https://example.com/${index + 1}`,
            })),
        });
    },
    port: 0,
});

afterAll(() => server.stop(true));

const resultsSchema = z.object({
    results: z.array(
        z.object({
            age: z.string().optional(),
            description: z.string(),
            title: z.string(),
            url: z.string(),
        })
    ),
});

const jsonSearch: SearchBackend = {
    async search({ count, query, signal }) {
        const response = await fetch(
            `http://127.0.0.1:${server.port}/search?q=${encodeURIComponent(query)}&count=${count}`,
            { signal }
        );
        if (!response.ok) {
            throw new Error(`the search API answered HTTP ${response.status}.`);
        }
        const { results } = resultsSchema.parse(await response.json());
        return {
            answer: null,
            results: results.map((result) => ({
                ...(result.age ? { publishedAt: result.age } : {}),
                snippet: result.description,
                title: result.title,
                url: result.url,
            })),
        };
    },
};

function search(query: string, count?: number) {
    return webSearch({ backend: jsonSearch, count, query, signal: new AbortController().signal });
}

describe('web_search', () => {
    test('with no backend it says search is not configured', async () => {
        expect(
            await webSearch({ backend: null, query: 'haus', signal: new AbortController().signal })
        ).toEqual({
            content: [
                {
                    text: 'Web search is not configured for this Haus. Use `web_fetch` to read a URL you already know.',
                    type: 'text',
                },
            ],
            isError: true,
        });
    });

    test('results are numbered with their link, date, and snippet', async () => {
        expect(await search('release cadence', 2)).toEqual({
            content: [
                {
                    text: [
                        'Sources:',
                        '1. Result 1',
                        '   https://example.com/1',
                        '   Published 2026-11-01',
                        '   Ships every Tuesday.',
                        '2. Result 2',
                        '   https://example.com/2',
                        '   Ships every Tuesday.',
                    ].join('\n'),
                    type: 'text',
                },
            ],
            isError: false,
        });
    });

    test('an empty result says so, and a failing backend is an error', async () => {
        expect((await search('nothing')).content).toEqual([
            { text: 'No results for "nothing".', type: 'text' },
        ]);
        expect(await search('broken')).toEqual({
            content: [
                { text: 'Web search failed: the search API answered HTTP 502.', type: 'text' },
            ],
            isError: true,
        });
    });

    test('a long answer is cut at 50 KiB with a line naming the cut', async () => {
        const [part] = (await search('huge', 20)).content;
        const text = part?.type === 'text' ? part.text : '';

        expect(text.split('\n').slice(-4)).toEqual([
            '3. Result 3',
            '   https://example.com/3',
            '',
            '[Showed lines 1-10 of 62; cut at the 50 KiB limit.]',
        ]);
    });
});
