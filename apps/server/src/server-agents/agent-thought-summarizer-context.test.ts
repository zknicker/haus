import { describe, expect, test } from 'bun:test';
import { thoughtRequestMaxLength } from '@haus/api';
import { createGeminiThoughtSummarizer } from './agent-thought-summarizer.ts';

function fakeGemini(text: string) {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    }) as unknown as typeof fetch;
    return {
        bodies,
        summarizer: createGeminiThoughtSummarizer({ apiKey: 'k', fetch: fetcher }),
    };
}

const firstCue = '\nReply with the status line, or SKIP if this is only housekeeping.';
const laterCue =
    '\nReply NEW: or STILL: and the status line, or SKIP if this is only housekeeping.';

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
        ).toEqual({ kind: 'phrase', stream: 'new', text: 'Pulling the NYC weather' });
        expect(userText(gemini.bodies[0])).toBe(
            `<request>\n${request.slice(0, thoughtRequestMaxLength)}\n</request>\n<title>\nPlanning data retrieval\n</title>${firstCue}`
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
        expect(system).toContain('First decide SKIP from the input alone');
        expect(system).toContain("drafting, reviewing, or preparing the agent's own reply");
        expect(system).toContain('keep its own verb and object');
        expect(system).toContain('never from anywhere else');
    });

    test('phrases a started action with the action note, and only then', async () => {
        const gemini = fakeGemini('Pulling the NYC forecast');
        expect(
            await gemini.summarizer.summarize({
                action: 'curl -fsS api.open-meteo.com/v1/forecast',
                kind: 'action',
                request: 'Weather in NYC?',
            })
        ).toEqual({ kind: 'phrase', stream: 'new', text: 'Pulling the NYC forecast' });
        expect(userText(gemini.bodies[0])).toBe(
            `<request>\nWeather in NYC?\n</request>\n<action>\ncurl -fsS api.open-meteo.com/v1/forecast\n</action>${firstCue}`
        );
        const system = JSON.stringify(gemini.bodies[0]?.systemInstruction);
        expect(system).toContain('The <action> block is not reasoning');
        expect(system).toContain('(MEMORY.md) is housekeeping, so SKIP');

        await gemini.summarizer.summarize({ kind: 'title', title: 'Checking the forecast' });
        expect(JSON.stringify(gemini.bodies[1]?.systemInstruction)).not.toContain('<action>');
    });

    test('lists the lines already shown and asks NEW or STILL, only once one has shown', async () => {
        const gemini = fakeGemini('Reading the failing job log');
        const source = { kind: 'title', title: 'Inspecting CI logs' } as const;
        await gemini.summarizer.summarize(source);
        await gemini.summarizer.summarize({ ...source, previous: [] });
        await gemini.summarizer.summarize({ ...source, previous: ['Checking the build status'] });
        await gemini.summarizer.summarize({
            ...source,
            previous: ['Pulling the CI runs', 'Checking the build status'],
        });

        // A run's first thought keeps exactly the prompt it had before.
        const bare = '<title>\nInspecting CI logs\n</title>';
        expect(userText(gemini.bodies[0])).toBe(`${bare}${firstCue}`);
        expect(userText(gemini.bodies[1])).toBe(`${bare}${firstCue}`);
        expect(userText(gemini.bodies[2])).toBe(
            `${bare}\nAlready shown: "Checking the build status".${laterCue}`
        );
        expect(userText(gemini.bodies[3])).toBe(
            `${bare}\nAlready shown: "Pulling the CI runs", then "Checking the build status".${laterCue}`
        );
        const systems = gemini.bodies.map((body) => JSON.stringify(body.systemInstruction));
        expect(systems[0]).toBe(systems[1] ?? '');
        expect(systems[0]).not.toContain('already saw');
        expect(systems[2]).toContain('already saw during this work');
        expect(systems[2]).toContain('starts a different part of the work or states a new');
        expect(systems[2]).toContain('Start with STILL:');
    });

    test('reads the workstream label, and an unlabeled or first line is new', async () => {
        const answers: [string, unknown][] = [
            [
                'NEW: Comparing the three Bun releases',
                { stream: 'new', text: 'Comparing the three Bun releases' },
            ],
            [
                'STILL: Digging through the changelog',
                { stream: 'still', text: 'Digging through the changelog' },
            ],
            [
                'still - digging through the changelog',
                { stream: 'still', text: 'Digging through the changelog' },
            ],
            [
                'Still digging through the changelog',
                { stream: 'still', text: 'Digging through the changelog' },
            ],
            [
                'Comparing the three Bun releases',
                { stream: 'new', text: 'Comparing the three Bun releases' },
            ],
        ];
        for (const [text, expected] of answers) {
            const gemini = fakeGemini(text);
            expect(
                await gemini.summarizer.summarize({
                    kind: 'title',
                    previous: ['Reading the Bun release notes'],
                    title: 'Scanning notes',
                })
            ).toEqual({ kind: 'phrase', ...(expected as object) } as never);
        }
        expect(
            await fakeGemini('STILL: SKIP').summarizer.summarize({
                kind: 'title',
                previous: ['Reading the Bun release notes'],
                title: 'Claiming the task',
            })
        ).toEqual({ kind: 'skip' });
    });

    test('sends a finished action with its result block and the finding note, and only then', async () => {
        const gemini = fakeGemini("Saturday looks wet, Sunday's clearer");
        expect(
            await gemini.summarizer.summarize({
                action: 'curl -fsS api.open-meteo.com/v1/forecast',
                kind: 'action',
                result: 'Saturday: rain 80%, high 58\nSunday: sunny, high 66',
            })
        ).toEqual({ kind: 'phrase', stream: 'new', text: "Saturday looks wet, Sunday's clearer" });
        expect(userText(gemini.bodies[0])).toBe(
            '<action>\ncurl -fsS api.open-meteo.com/v1/forecast\n</action>\n<result>\nSaturday: rain 80%, high 58\nSunday: sunny, high 66\n</result>\nReply with the finding or the status line, or SKIP if this is only housekeeping.'
        );
        const system = JSON.stringify(gemini.bodies[0]?.systemInstruction);
        expect(system).toContain('The <result> block');
        expect(system).toContain('never quote the result');
        expect(system).toContain('never state a finding');

        await gemini.summarizer.summarize({ action: 'curl wttr.in/Chicago', kind: 'action' });
        expect(userText(gemini.bodies[1])).not.toContain('<result>');
        expect(JSON.stringify(gemini.bodies[1]?.systemInstruction)).not.toContain('<result>');
    });
});
