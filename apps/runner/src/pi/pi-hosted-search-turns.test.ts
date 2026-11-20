import { afterEach, expect, test } from 'bun:test';
import { drainCleanups, live } from '../runner-test-server.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { collect } from './pi-faux-run.ts';
import { HostedSearchLog, withHostedSearch } from './pi-hosted-search.ts';
import {
    providerStandIn,
    responsesAnswer,
    standInModels,
    standInSession,
} from './provider-stand-in.ts';

afterEach(drainCleanups);

const search = {
    action: { query: 'haus release day', type: 'search' },
    id: 'ws_stale',
    status: 'completed',
    type: 'web_search_call',
};

const searchThenStall = () => {
    const events = [
        { response: { id: 'resp_1', status: 'in_progress' }, type: 'response.created' },
        {
            item: { ...search, status: 'in_progress' },
            output_index: 0,
            type: 'response.output_item.added',
        },
        { item: search, output_index: 0, type: 'response.output_item.done' },
        {
            item: {
                content: [],
                id: 'msg_1',
                role: 'assistant',
                status: 'in_progress',
                type: 'message',
            },
            output_index: 1,
            type: 'response.output_item.added',
        },
        { delta: 'Haus', output_index: 1, type: 'response.output_text.delta' },
    ];
    const body = events
        .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        .join('');
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
        },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
};

test('the searches of a request that ends aborted are dropped, so the next answer reports only its own', async () => {
    const standIn = providerStandIn([
        searchThenStall,
        () => responsesAnswer({ searches: [{ id: 'ws_next', query: 'haus' }], text: 'Tuesdays.' }),
    ]);
    const { opened } = await standInModels(
        { modelId: 'grok-4.7', webSearch: true },
        standIn.origin
    );
    const log = new HostedSearchLog();
    const models = withHostedSearch(opened.models, log);
    const model = opened.models.getModel('xai', 'grok-4.7');
    if (!model) {
        throw new Error('The xAI stand-in has no grok-4.7.');
    }
    const context = { messages: [{ content: 'When?', role: 'user' as const, timestamp: 1 }] };
    const stop = new AbortController();

    const aborted = models.streamSimple(model, context, { signal: stop.signal });
    for await (const event of aborted) {
        if (event.type === 'text_delta') {
            stop.abort();
        }
    }
    await aborted.result();
    await models.streamSimple(model, context, { signal: live() }).result();

    expect(
        log.drain().map((event) => [event.type, 'toolCallId' in event && event.toolCallId])
    ).toEqual([
        ['tool-call', 'ws_next'],
        ['tool-result', 'ws_next'],
    ]);
});

test('a hosted search from an aborted turn never reaches the next turn on the warm session', async () => {
    const { session } = await standInSession({
        answers: [searchThenStall, () => responsesAnswer({ text: 'Tuesdays.' })],
        modelId: 'grok-4.7',
        webSearch: true,
    });
    const stop = new AbortController();
    const first = await session.startTurn({ prompt: 'When does Haus ship?', signal: stop.signal });
    const events = first.events[Symbol.asyncIterator]();
    let event: IteratorResult<TurnEvent> = await events.next();
    while (!event.done && event.value.type !== 'text-delta') {
        event = await events.next();
    }
    stop.abort();
    while (!event.done) {
        event = await events.next();
    }
    await first.settle();

    const second = await session.startTurn({ prompt: 'And again?', signal: live() });

    expect((await collect(second.events)).steps).toEqual([
        'step-finish',
        { type: 'turn-finish', usage: true },
    ]);
});
