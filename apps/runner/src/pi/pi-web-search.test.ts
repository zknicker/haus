import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import {
    geminiParts,
    geminiStream,
    responsesAnswer,
    searchTurn,
    toolsOf,
} from './provider-stand-in.ts';

afterEach(drainCleanups);

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

    test('an opened page is a source, and a page cited twice with tracking parameters is one source', async () => {
        const { events } = await searchTurn({
            answers: [
                () =>
                    responsesAnswer({
                        citations: [
                            {
                                title: 'Haus releases',
                                url: 'https://haus.example/releases?utm_source=openai',
                            },
                            { title: 'Haus releases', url: 'https://haus.example/releases#latest' },
                        ],
                        searches: [
                            {
                                action: {
                                    type: 'open_page',
                                    url: 'https://haus.example/changelog',
                                },
                                id: 'ws_2',
                            },
                        ],
                        text: 'Haus ships on Tuesdays.',
                    }),
            ],
            modelId: 'grok-4.7',
            webSearch: ['xai'],
        });

        expect(events.steps.slice(0, 2)).toEqual([
            {
                input: {},
                nativeName: 'web_search',
                providerExecuted: true,
                toolCallId: 'ws_2',
                toolName: 'webSearch',
                type: 'tool-call',
            },
            {
                nativeName: 'web_search',
                output: {
                    query: null,
                    sources: [
                        { title: null, url: 'https://haus.example/changelog' },
                        { title: 'Haus releases', url: 'https://haus.example/releases' },
                    ],
                },
                providerExecuted: true,
                toolCallId: 'ws_2',
                toolName: 'webSearch',
                type: 'tool-result',
            },
        ]);
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
