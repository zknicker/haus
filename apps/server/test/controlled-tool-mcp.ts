import { SUBSCRIPTION_ID_META_KEY } from '@modelcontextprotocol/client';

export function startControlledToolMcp(modern: boolean, notifications = modern) {
    let tools = ['echo'];
    let failLists = false;
    let listWait: Promise<void> | undefined;
    let lists = 0;
    const calls: string[] = [];
    const streams = new Map<string | number, ReadableStreamDefaultController<Uint8Array>>();
    const encoder = new TextEncoder();
    function subscribe(id: string | number) {
        return new ReadableStream<Uint8Array>({
            start(controller) {
                streams.set(id, controller);
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'notifications/subscriptions/acknowledged',
                            params: {
                                notifications: { toolsListChanged: true },
                                _meta: { [SUBSCRIPTION_ID_META_KEY]: String(id) },
                            },
                        })}\n\n`
                    )
                );
            },
            cancel() {
                streams.delete(id);
            },
        });
    }
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request) => {
            if (request.method === 'GET' && notifications) {
                return new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            streams.set('legacy', controller);
                        },
                        cancel() {
                            streams.delete('legacy');
                        },
                    }),
                    { headers: { 'content-type': 'text/event-stream' } }
                );
            }
            if (request.method !== 'POST') {
                return new Response(null, { status: 405 });
            }
            const message = (await request.json()) as {
                id?: number | string;
                method: string;
                params?: { name?: string };
            };
            const id = message.id;
            if (id === undefined) {
                return new Response(null, { status: 202 });
            }
            const reply = (result: unknown) => Response.json({ id, jsonrpc: '2.0', result });
            const unknown = () =>
                Response.json({
                    id,
                    jsonrpc: '2.0',
                    error: { code: -32_601, message: 'Method not found' },
                });
            const complete = modern ? { resultType: 'complete' } : {};
            switch (message.method) {
                case 'server/discover':
                    return modern
                        ? reply({
                              ...complete,
                              supportedVersions: ['2026-07-28'],
                              capabilities: { tools: { listChanged: true } },
                              _meta: {
                                  'io.modelcontextprotocol/serverInfo': {
                                      name: 'Fixture',
                                      version: '1',
                                  },
                              },
                          })
                        : unknown();
                case 'initialize':
                    return reply({
                        protocolVersion: '2025-06-18',
                        capabilities: { tools: { listChanged: notifications } },
                        serverInfo: { name: 'Fixture', version: '1' },
                    });
                case 'subscriptions/listen':
                    return new Response(subscribe(id), {
                        headers: { 'content-type': 'text/event-stream' },
                    });
                case 'tools/list':
                    lists += 1;
                    await listWait;
                    if (failLists) {
                        return new Response(null, { status: 503 });
                    }
                    return reply({
                        ...complete,
                        ttlMs: 300_000,
                        cacheScope: 'private',
                        tools: tools.map((name) => ({ name, inputSchema: { type: 'object' } })),
                    });
                case 'tools/call':
                    calls.push(message.params?.name ?? '');
                    return reply({ ...complete, content: [{ type: 'text', text: 'ok' }] });
                default:
                    return unknown();
            }
        },
    });
    return {
        url: `http://127.0.0.1:${server.port}/mcp`,
        calls,
        lists: () => lists,
        subscribed: () => streams.size > 0,
        replace(names: string[]) {
            tools = names;
        },
        fail(value: boolean) {
            failLists = value;
        },
        wait(value: Promise<void> | undefined) {
            listWait = value;
        },
        notify() {
            for (const [id, controller] of streams) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'notifications/tools/list_changed',
                            params: { _meta: { [SUBSCRIPTION_ID_META_KEY]: String(id) } },
                        })}\n\n`
                    )
                );
            }
        },
        endStreams() {
            for (const [id, controller] of streams) {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ jsonrpc: '2.0', id, result: { resultType: 'complete' } })}\n\n`
                    )
                );
                controller.close();
            }
            streams.clear();
        },
        stop: () => server.stop(true),
    };
}
