import { describe, expect, test } from 'bun:test';
import { createGeminiThoughtSummarizer, thoughtSummaryModel } from './thought-summarizer.ts';

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
        });
        expect(await summarizer.summarize('The user wants the Halloween bids compared.')).toBe(
            "I'm comparing Halloween bids to last week"
        );
        const [call] = gemini.calls;
        expect(call?.url).toContain(`/models/${thoughtSummaryModel}:generateContent`);
        expect(call?.headers['x-goog-api-key']).toBe('test-key');
        expect(call?.body.generationConfig).toEqual({
            maxOutputTokens: 24,
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: 'minimal' },
        });
        expect(call?.body.contents).toEqual([
            {
                parts: [
                    {
                        text: '<reasoning>\nThe user wants the Halloween bids compared.\n</reasoning>',
                    },
                ],
                role: 'user',
            },
        ]);
    });

    test('drops the thought on an error status, an empty answer, or a transport failure', async () => {
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
            expect(await summarizer.summarize('some reasoning worth summarizing')).toBeNull();
        }
    });

    test('drops an answer that misses the deadline', async () => {
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
        expect(await summarizer.summarize('slow reasoning block')).toBeNull();
    });
});
