import { afterEach, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import { geminiParts, geminiStream, searchTurn } from './provider-stand-in.ts';

afterEach(drainCleanups);

test('a grounding chunk whose link is not a URL is skipped and the search keeps its other sources', async () => {
    const { events } = await searchTurn({
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
                                { web: { uri: 'not a url' } },
                                { web: { title: 'broken', uri: 'also not a url' } },
                                {
                                    web: {
                                        title: 'haus.example',
                                        uri: 'https://haus.example/releases',
                                    },
                                },
                            ],
                        },
                    }),
                ]),
            () => geminiStream([geminiParts([{ text: 'Tuesdays.' }])]),
        ],
        modelId: 'gemini-2.5-pro',
        webSearch: true,
    });

    expect(events.steps).toContainEqual({
        output: [
            'Haus ships on Tuesdays.',
            '',
            'Sources:',
            '1. haus.example',
            '   https://haus.example/releases',
        ].join('\n'),
        toolCallId: 'call_1',
        toolName: 'web_search',
        type: 'tool-result',
    });
});
