import { describe, expect, test } from 'bun:test';
import {
    createGeminiThoughtSummarizer,
    thoughtOpenings,
    thoughtSummaryModel,
} from './agent-thought-summarizer.ts';

function fakeGemini(respond: (init: RequestInit) => Promise<Response>) {
    const calls: { body: Record<string, unknown>; headers: Record<string, string>; url: string }[] =
        [];
    const fetcher = (async (url: string, init: RequestInit) => {
        calls.push({
            body: JSON.parse(String(init.body)),
            headers: init.headers as Record<string, string>,
            url,
        });
        return await respond(init);
    }) as unknown as typeof fetch;
    return { calls, fetcher };
}

const answer = (text: string, extra: Record<string, unknown>[] = []) =>
    Response.json({ candidates: [{ content: { parts: [...extra, { text }] } }] });

describe('Gemini thought summarizer', () => {
    test('sends one bounded, minimal-thinking request and finishes the answer', async () => {
        const gemini = fakeGemini(async () =>
            answer('"Comparing Halloween bids to last week."', [{ text: 'hmm', thought: true }])
        );
        const summarizer = createGeminiThoughtSummarizer({
            apiKey: 'test-key',
            fetch: gemini.fetcher,
            random: () => 0.99,
        });
        expect(
            await summarizer.summarize({
                kind: 'reasoning',
                reasoning: 'The user wants the Halloween bids compared.',
            })
        ).toEqual({ kind: 'phrase', text: 'Comparing Halloween bids to last week' });
        const [call] = gemini.calls;
        expect(call?.url).toContain(`/models/${thoughtSummaryModel}:generateContent`);
        expect(call?.headers['x-goog-api-key']).toBe('test-key');
        expect(call?.body.generationConfig).toEqual({
            maxOutputTokens: 32,
            temperature: 0.8,
            thinkingConfig: { thinkingLevel: 'minimal' },
        });
        expect(call?.body.contents).toEqual([
            {
                parts: [
                    {
                        text: `<reasoning>\nThe user wants the Halloween bids compared.\n</reasoning>\n${thoughtOpenings.at(-1)}`,
                    },
                ],
                role: 'user',
            },
        ]);
    });

    test('draws a different opening per request so lines vary', async () => {
        const gemini = fakeGemini(async () => answer('Pulling royalties first'));
        const draws = [0, 0.2, 0.99];
        const summarizer = createGeminiThoughtSummarizer({
            apiKey: 'test-key',
            fetch: gemini.fetcher,
            random: () => draws.shift() ?? 0,
        });
        for (let index = 0; index < 3; index += 1) {
            expect(
                await summarizer.summarize({
                    kind: 'reasoning',
                    reasoning: 'Pulling royalties before comparing weeks.',
                })
            ).toEqual({ kind: 'phrase', text: 'Pulling royalties first' });
        }
        const openings = gemini.calls.map((call) =>
            String((call.body.contents as { parts: { text: string }[] }[])[0]?.parts[0]?.text)
                .split('\n')
                .at(-1)
        );
        expect(openings).toEqual([thoughtOpenings[0], thoughtOpenings[1], thoughtOpenings.at(-1)]);
    });

    test('answers null on an error status, an empty answer, or a transport failure', async () => {
        for (const respond of [
            async () => new Response('quota', { status: 429 }),
            async () => Response.json({ candidates: [{ content: { parts: [] } }] }),
            async () => Response.json({ promptFeedback: { blockReason: 'OTHER' } }),
            async () => {
                throw new Error('offline');
            },
        ]) {
            const summarizer = createGeminiThoughtSummarizer({
                apiKey: 'k',
                fetch: fakeGemini(respond).fetcher,
            });
            expect(
                await summarizer.summarize({
                    kind: 'reasoning',
                    reasoning: 'some reasoning worth summarizing',
                })
            ).toBeNull();
        }
    });

    test('answers null when Gemini misses the deadline', async () => {
        const gemini = fakeGemini(
            (init) =>
                new Promise((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
                })
        );
        const summarizer = createGeminiThoughtSummarizer({
            apiKey: 'k',
            fetch: gemini.fetcher,
            timeoutMs: 5,
        });
        expect(
            await summarizer.summarize({ kind: 'reasoning', reasoning: 'slow reasoning block' })
        ).toBeNull();
    });

    test('answers skip for SKIP, tolerating stray punctuation, and never phrases it', async () => {
        for (const text of ['SKIP', 'Skip.', '"SKIP"']) {
            const summarizer = createGeminiThoughtSummarizer({
                apiKey: 'k',
                fetch: fakeGemini(async () => answer(text)).fetcher,
            });
            expect(
                await summarizer.summarize({
                    kind: 'reasoning',
                    reasoning: 'Let me read my MEMORY.md before anything else.',
                })
            ).toEqual({ kind: 'skip' });
        }
    });

    test('asks for a title in the same request shape and instructs SKIP for housekeeping', async () => {
        const gemini = fakeGemini(async () => answer('Now inspecting the chart data'));
        const summarizer = createGeminiThoughtSummarizer({
            apiKey: 'k',
            fetch: gemini.fetcher,
            random: () => 0,
        });
        expect(
            await summarizer.summarize({ kind: 'title', title: "I'm inspecting chart data" })
        ).toEqual({ kind: 'phrase', text: 'Now inspecting the chart data' });
        const [call] = gemini.calls;
        expect(call?.body.contents).toEqual([
            {
                parts: [
                    { text: `<title>\nI'm inspecting chart data\n</title>\n${thoughtOpenings[0]}` },
                ],
                role: 'user',
            },
        ]);
        const system = JSON.stringify(call?.body.systemInstruction);
        expect(system).toContain('Reply with exactly SKIP');
        expect(system).toContain('claiming, assigning, or updating tasks');
    });
});
