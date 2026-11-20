import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import { completionsStream, responsesStream, searchTurn, toolsOf } from './provider-stand-in.ts';

afterEach(drainCleanups);

const searchFacts = {
    nativeName: 'web_search',
    providerExecuted: true,
    toolName: 'webSearch',
} as const;

function completionsChunk(delta: Record<string, unknown>) {
    return {
        choices: [{ delta, finish_reason: null, index: 0 }],
        created: 1,
        id: 'gen-1',
        model: 'moonshotai/kimi-k2.6',
        object: 'chat.completion.chunk',
    };
}

function finishChunk(usage: Record<string, unknown>) {
    return {
        ...completionsChunk({}),
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        usage: { completion_tokens: 5, prompt_tokens: 10, total_tokens: 15, ...usage },
    };
}

const searchedCompletion = () =>
    completionsStream([
        completionsChunk({ content: 'Haus ships on Tuesdays.', role: 'assistant' }),
        completionsChunk({
            annotations: [
                {
                    type: 'url_citation',
                    url_citation: {
                        content: 'Releases go out every Tuesday.',
                        end_index: 22,
                        start_index: 0,
                        title: 'Haus releases',
                        url: 'https://haus.example/releases?utm_medium=search',
                    },
                },
            ],
        }),
        finishChunk({ server_tool_use_details: { web_search_requests: 2 } }),
    ]);

const searchedMessage = () =>
    responsesStream([
        {
            message: {
                content: [],
                id: 'msg_1',
                model: 'anthropic/claude-fable-5',
                role: 'assistant',
                type: 'message',
                usage: { input_tokens: 10, output_tokens: 0 },
            },
            type: 'message_start',
        },
        {
            content_block: {
                id: 'srvtoolu_1',
                input: {},
                name: 'web_search',
                type: 'server_tool_use',
            },
            index: 0,
            type: 'content_block_start',
        },
        {
            delta: { partial_json: '{"query": "haus ', type: 'input_json_delta' },
            index: 0,
            type: 'content_block_delta',
        },
        {
            delta: { partial_json: 'release day"}', type: 'input_json_delta' },
            index: 0,
            type: 'content_block_delta',
        },
        { index: 0, type: 'content_block_stop' },
        {
            content_block: {
                content: [
                    {
                        encrypted_content: 'opaque',
                        page_age: null,
                        title: 'Haus releases',
                        type: 'web_search_result',
                        url: 'https://haus.example/releases',
                    },
                ],
                tool_use_id: 'srvtoolu_1',
                type: 'web_search_tool_result',
            },
            index: 1,
            type: 'content_block_start',
        },
        { index: 1, type: 'content_block_stop' },
        { content_block: { text: '', type: 'text' }, index: 2, type: 'content_block_start' },
        {
            delta: {
                citation: {
                    cited_text: 'Releases go out every Tuesday.',
                    encrypted_index: 'opaque',
                    title: 'Haus changelog',
                    type: 'web_search_result_location',
                    url: 'https://haus.example/changelog',
                },
                type: 'citations_delta',
            },
            index: 2,
            type: 'content_block_delta',
        },
        {
            delta: { text: 'Haus ships on Tuesdays.', type: 'text_delta' },
            index: 2,
            type: 'content_block_delta',
        },
        { index: 2, type: 'content_block_stop' },
        {
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            type: 'message_delta',
            usage: { output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
        },
        { type: 'message_stop' },
    ]);

describe('OpenRouter web search', () => {
    test('a Chat Completions request carries the openrouter:web_search server tool and its citations reach the turn', async () => {
        const { events, requests } = await searchTurn({
            answers: [searchedCompletion],
            modelId: 'moonshotai/kimi-k2.6',
            webSearch: ['openrouter'],
        });

        expect(requests.map((request) => request.path)).toEqual([
            '/openrouter/api/v1/chat/completions',
        ]);
        expect(toolsOf(requests[0]?.body ?? {})).toEqual([
            'function bash',
            'function str_replace_based_edit_tool',
            'function execute',
            'function web_fetch',
            'openrouter:web_search',
        ]);
        expect(events.steps).toEqual([
            { ...searchFacts, input: {}, toolCallId: 'gen-1-web-search', type: 'tool-call' },
            {
                ...searchFacts,
                output: {
                    query: null,
                    sources: [{ title: 'Haus releases', url: 'https://haus.example/releases' }],
                },
                toolCallId: 'gen-1-web-search',
                type: 'tool-result',
            },
            'step-finish',
            { type: 'turn-finish', usage: true },
        ]);
        expect(events.text).toBe('Haus ships on Tuesdays.');
    });

    test('a Messages request for a Claude model carries the server tool, and its search, results, and citations reach the turn', async () => {
        const { events, requests } = await searchTurn({
            answers: [searchedMessage],
            modelId: 'anthropic/claude-fable-5',
            webSearch: ['openrouter'],
        });

        expect(requests.map((request) => request.path)).toEqual(['/openrouter/api/v1/messages']);
        expect(toolsOf(requests[0]?.body ?? {})).toEqual([
            'function bash',
            'function str_replace_based_edit_tool',
            'function execute',
            'function web_fetch',
            'openrouter:web_search',
        ]);
        expect(events.steps).toEqual([
            {
                ...searchFacts,
                input: { query: 'haus release day' },
                toolCallId: 'srvtoolu_1',
                type: 'tool-call',
            },
            {
                ...searchFacts,
                output: {
                    query: 'haus release day',
                    sources: [
                        { title: 'Haus releases', url: 'https://haus.example/releases' },
                        { title: 'Haus changelog', url: 'https://haus.example/changelog' },
                    ],
                },
                toolCallId: 'srvtoolu_1',
                type: 'tool-result',
            },
            'step-finish',
            { type: 'turn-finish', usage: true },
        ]);
        expect(events.text).toBe('Haus ships on Tuesdays.');
    });

    test('with OpenRouter search off, the request has no server tool and the Agent has web_search', async () => {
        const { requests } = await searchTurn({
            answers: [
                () =>
                    completionsStream([
                        completionsChunk({ content: 'Not sure.' }),
                        finishChunk({}),
                    ]),
            ],
            modelId: 'moonshotai/kimi-k2.6',
            webSearch: ['xai'],
        });

        expect(toolsOf(requests[0]?.body ?? {})).toEqual([
            'function bash',
            'function str_replace_based_edit_tool',
            'function execute',
            'function web_fetch',
            'function web_search',
        ]);
    });
});
