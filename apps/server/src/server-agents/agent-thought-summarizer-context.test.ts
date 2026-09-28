import { describe, expect, test } from 'bun:test';
import { thoughtRequestMaxLength } from '@haus/api';
import { createGeminiThoughtSummarizer, thoughtOpenings } from './agent-thought-summarizer.ts';

function fakeGemini(text: string) {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    }) as unknown as typeof fetch;
    return {
        bodies,
        summarizer: createGeminiThoughtSummarizer({
            apiKey: 'k',
            fetch: fetcher,
            random: () => 0,
        }),
    };
}

function userText(body: Record<string, unknown> | undefined): string {
    const [content] = (body?.contents ?? []) as { parts: { text: string }[] }[];
    return content?.parts[0]?.text ?? '';
}

describe('Gemini thought summarizer context', () => {
    test('puts the engaged request ahead of the title as capped context', async () => {
        const gemini = fakeGemini('Pulling the NYC weather');
        const request = `@Blippy can you check the weather in NYC right now? ${'x'.repeat(600)}`;
        expect(
            await gemini.summarizer.summarize({
                kind: 'title',
                request,
                title: 'Planning data retrieval',
            })
        ).toEqual({ kind: 'phrase', text: 'Pulling the NYC weather' });
        expect(userText(gemini.bodies[0])).toBe(
            `<request>\n${request.slice(0, thoughtRequestMaxLength)}\n</request>\n<title>\nPlanning data retrieval\n</title>\n${thoughtOpenings[0]}`
        );
    });

    test('sends no request block or request instructions without one', async () => {
        const gemini = fakeGemini('Checking the deploy');
        await gemini.summarizer.summarize({ kind: 'title', title: 'Checking the deploy' });
        expect(userText(gemini.bodies[0])).not.toContain('<request>');
        expect(JSON.stringify(gemini.bodies[0]?.systemInstruction)).not.toContain('<request>');
    });

    test('tells the model the request is context, a noun source, and never a reason to show housekeeping', async () => {
        const gemini = fakeGemini('SKIP');
        expect(
            await gemini.summarizer.summarize({
                kind: 'title',
                request: 'Can you check the weather?',
                title: "I'm claiming weather task",
            })
        ).toEqual({ kind: 'skip' });
        const system = JSON.stringify(gemini.bodies[0]?.systemInstruction);
        expect(system).toContain('The <request> block');
        expect(system).toContain('Decide SKIP from the title or reasoning alone');
        expect(system).toContain('the request never turns housekeeping into work');
        expect(system).toContain("in the request's concrete terms");
        expect(system).toContain('never from anywhere else');
    });
});
