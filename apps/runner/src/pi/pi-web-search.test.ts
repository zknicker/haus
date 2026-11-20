import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups, live, startedRun, cleanups } from '../runner-test-server.ts';
import { createPiHarness } from './pi-driver.ts';
import { agentDir, collect, launch } from './pi-faux-run.ts';
import type { WebSearchProvider } from './pi-web-search.ts';
import {
    geminiParts,
    geminiStream,
    providerStandIn,
    responsesAnswer,
    standInModels,
} from './provider-stand-in.ts';

afterEach(drainCleanups);

async function searchTurn(input: {
    answers: Parameters<typeof providerStandIn>[0];
    modelId: string;
    webSearch: readonly WebSearchProvider[];
}) {
    const standIn = providerStandIn(input.answers);
    const harness = createPiHarness({
        log: () => undefined,
        maxWarm: 1,
        models: await standInModels(standIn.origin),
        webSearch: input.webSearch,
    });
    cleanups.push(() => harness.close());
    const { run } = await startedRun();
    const session = await harness
        .factory(launch(await agentDir(), run.tools, input.modelId))
        .openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
    const turn = await session.startTurn({ prompt: 'When does Haus ship?', signal: live() });
    return { events: await collect(turn.events), requests: standIn.requests };
}

const hostedSearch = () =>
    responsesAnswer({
        citations: [{ title: 'Haus releases', url: 'https://haus.example/releases' }],
        searches: [{ id: 'ws_1', query: 'haus release day' }],
        text: 'Haus ships on Tuesdays.',
    });

const hostedEvents = [
    {
        input: { query: 'haus release day' },
        nativeName: 'web_search',
        providerExecuted: true,
        toolCallId: 'ws_1',
        toolName: 'webSearch',
        type: 'tool-call',
    },
    {
        nativeName: 'web_search',
        output: {
            query: 'haus release day',
            sources: [{ title: 'Haus releases', url: 'https://haus.example/releases' }],
        },
        providerExecuted: true,
        toolCallId: 'ws_1',
        toolName: 'webSearch',
        type: 'tool-result',
    },
    'step-finish',
    { type: 'turn-finish', usage: true },
];

function toolsOf(body: Record<string, unknown>) {
    const tools: { name?: string; type?: string }[] = Array.isArray(body.tools) ? body.tools : [];
    return tools.map((tool) => (tool.type === 'function' ? `function ${tool.name}` : tool.type));
}

describe('native web search on Pi', () => {
    test('the ChatGPT plan request carries the hosted web_search tool and its citations reach the turn', async () => {
        const { events, requests } = await searchTurn({
            answers: [hostedSearch],
            modelId: 'gpt-5.6-sol',
            webSearch: ['openai-codex'],
        });

        expect(requests.map((request) => request.path)).toEqual(['/chatgpt/codex/responses']);
        expect(toolsOf(requests[0]?.body ?? {})).toEqual(['web_search']);
        expect(events.steps).toEqual(hostedEvents);
        expect(events.text).toBe('Haus ships on Tuesdays.');
    });

    test('the xAI request carries the hosted web_search tool and its citations reach the turn', async () => {
        const { events, requests } = await searchTurn({
            answers: [hostedSearch],
            modelId: 'grok-4.7',
            webSearch: ['xai'],
        });

        expect(requests.map((request) => request.path)).toEqual(['/xai/v1/responses']);
        expect(toolsOf(requests[0]?.body ?? {})).toEqual([
            'function bash',
            'function str_replace_based_edit_tool',
            'function execute',
            'function web_fetch',
            'web_search',
        ]);
        expect(events.steps).toEqual(hostedEvents);
    });

    test('with search off, no hosted tool is sent and the Agent has the web_search tool instead', async () => {
        const { requests } = await searchTurn({
            answers: [() => responsesAnswer({ text: 'Not sure.' })],
            modelId: 'grok-4.7',
            webSearch: ['google'],
        });

        expect(toolsOf(requests[0]?.body ?? {})).toEqual([
            'function bash',
            'function str_replace_based_edit_tool',
            'function execute',
            'function web_fetch',
            'function web_search',
        ]);
    });

    test('a Gemini web_search call sends one grounded request with only googleSearch', async () => {
        const { events, requests } = await searchTurn({
            answers: [
                () =>
                    geminiStream([
                        geminiParts([
                            {
                                functionCall: {
                                    args: { query: 'haus release day' },
                                    id: 'call_1',
                                    name: 'web_search',
                                },
                            },
                        ]),
                    ]),
                () =>
                    geminiStream([
                        geminiParts([{ text: 'Haus ships on Tuesdays.' }], {
                            groundingMetadata: {
                                groundingChunks: [
                                    {
                                        web: {
                                            title: 'haus.example',
                                            uri: 'https://haus.example/releases',
                                        },
                                    },
                                ],
                                groundingSupports: [
                                    {
                                        groundingChunkIndices: [0],
                                        segment: { text: 'Haus ships on Tuesdays.' },
                                    },
                                ],
                                webSearchQueries: ['haus release day'],
                            },
                        }),
                    ]),
                () => geminiStream([geminiParts([{ text: 'Tuesdays.' }])]),
            ],
            modelId: 'gemini-2.5-pro',
            webSearch: ['google'],
        });

        expect(requests.map((request) => request.path)).toEqual([
            '/google/models/gemini-2.5-pro:streamGenerateContent',
            '/google/models/gemini-2.5-pro:streamGenerateContent',
            '/google/models/gemini-2.5-pro:streamGenerateContent',
        ]);
        expect(requests[1]?.body.tools).toEqual([{ googleSearch: {} }]);
        expect(requests[1]?.body.contents).toEqual([
            { parts: [{ text: 'haus release day' }], role: 'user' },
        ]);
        expect(events.steps).toContainEqual({
            output: [
                'Haus ships on Tuesdays.',
                '',
                'Sources:',
                '1. haus.example',
                '   https://haus.example/releases',
                '   Haus ships on Tuesdays.',
            ].join('\n'),
            toolCallId: 'call_1',
            toolName: 'web_search',
            type: 'tool-result',
        });
        expect(events.text).toBe('Tuesdays.');
    });
});
