import { describe, expect, it } from 'bun:test';

import type { HausCreateMessageRequest } from '@haus/api';

import { createHausClient } from './client.ts';

describe('Haus SDK client', () => {
    it('posts chat messages through the OpenAPI path', async () => {
        const requests: Request[] = [];
        const client = createHausClient({
            baseUrl: 'http://runtime.test/',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    cursor: '7',
                    idempotent: false,
                    message: {
                        author: {
                            id: 'usr_1',
                            kind: 'user',
                            label: 'User',
                            metadata: {},
                        },
                        chat_id: 'cht_1',
                        attachments: [],
                        content: 'hello',
                        created_at: '2026-05-17T00:00:00.000Z',
                        deleted_at: null,
                        delivery_id: null,
                        id: 'msg_1',
                        metadata: {},
                        nonce: 'nonce_1',
                        role: 'user',
                        sequence: 1,
                    },
                });
            }) as typeof fetch,
        });
        const body: HausCreateMessageRequest = {
            author_id: 'usr_1',
            content: 'hello',
            id: 'msg_1',
            nonce: 'nonce_1',
            role: 'user',
        };

        const receipt = await client.chat.createMessage('cht_1', body);

        expect(receipt.message.id).toBe('msg_1');
        expect(receipt.idempotent).toBe(false);
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('POST');
        expect(requests[0].url).toBe('http://runtime.test/api/chats/cht_1/messages');
        expect(await requests[0].json()).toEqual(body);
    });

    it('opens realtime sockets as live notification streams', () => {
        const urls: string[] = [];
        class FakeWebSocket extends EventTarget {
            constructor(url: string | URL) {
                super();
                urls.push(String(url));
            }
        }
        const client = createHausClient({
            baseUrl: 'https://runtime.test',
            WebSocket: FakeWebSocket as typeof WebSocket,
        });

        const socket = client.realtime.connect();

        expect(socket).toBeInstanceOf(FakeWebSocket);
        expect(urls).toEqual(['wss://runtime.test/api/events/ws']);
    });

    it('passes realtime recipient filters through event lists and sockets', async () => {
        const requests: Request[] = [];
        const urls: string[] = [];
        class FakeWebSocket extends EventTarget {
            constructor(url: string | URL) {
                super();
                urls.push(String(url));
            }
        }
        const client = createHausClient({
            baseUrl: 'https://runtime.test',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    events: [],
                    next_cursor: null,
                });
            }) as typeof fetch,
            WebSocket: FakeWebSocket as typeof WebSocket,
        });

        await client.realtime.events({
            limit: 25,
            recipientId: 'usr_1',
        });
        client.realtime.connect({ recipientId: 'usr_1' });

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe('https://runtime.test/api/events?limit=25&recipient_id=usr_1');
        expect(urls).toEqual(['wss://runtime.test/api/events/ws?recipient_id=usr_1']);
    });

    it('lists chat activity through the OpenAPI path', async () => {
        const requests: Request[] = [];
        const client = createHausClient({
            baseUrl: 'http://runtime.test/',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    next_sequence: null,
                    responses: [],
                });
            }) as typeof fetch,
        });

        const response = await client.chat.responses('cht_1');

        expect(response.responses).toEqual([]);
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('GET');
        expect(requests[0].url).toBe('http://runtime.test/api/chats/cht_1/responses');
    });

    it('reads a turn-aligned timeline page through the OpenAPI path', async () => {
        const requests: Request[] = [];
        const client = createHausClient({
            baseUrl: 'http://runtime.test/',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    activity: [],
                    artifacts: [],
                    messages: [],
                    next_before_sequence: null,
                    responses: [],
                    total_messages: 0,
                });
            }) as typeof fetch,
        });

        const page = await client.chat.timeline('cht_1', { beforeSequence: 42, limit: 100 });

        expect(page.next_before_sequence).toBeNull();
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('GET');
        expect(requests[0].url).toBe(
            'http://runtime.test/api/chats/cht_1/timeline?before_sequence=42&limit=100'
        );
    });

    it('gets turn prompt evidence through the OpenAPI path', async () => {
        const requests: Request[] = [];
        const client = createHausClient({
            baseUrl: 'http://runtime.test/',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    captured_at: '2026-07-07T12:00:00.000Z',
                    instructions: 'You are Haus.',
                    prompt: 'Current Haus turn: ...',
                    run_id: 'run_1_primary',
                });
            }) as typeof fetch,
        });

        const evidence = await client.chat.turnPrompt('run_1_primary');

        expect(evidence.run_id).toBe('run_1_primary');
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('GET');
        expect(requests[0].url).toBe('http://runtime.test/api/turns/run_1_primary/prompt');
    });

    it('gets one response activity through the OpenAPI path', async () => {
        const requests: Request[] = [];
        const client = createHausClient({
            baseUrl: 'http://runtime.test/',
            fetch: (async (input, init) => {
                const request = new Request(input, init);
                requests.push(request);

                return Response.json({
                    artifact_ids: [],
                    chat_id: 'cht_1',
                    completed_at: null,
                    detail: null,
                    id: 'act_1',
                    kind: 'tool_call',
                    metadata: {},
                    response_id: 'rsp_1',
                    sequence: 1,
                    started_at: '2026-05-21T12:00:00.000Z',
                    status: 'running',
                    summary: null,
                    title: 'Using tool',
                    updated_at: '2026-05-21T12:00:00.000Z',
                });
            }) as typeof fetch,
        });

        const activity = await client.chat.activity('cht_1', 'act_1');

        expect(activity.id).toBe('act_1');
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('GET');
        expect(requests[0].url).toBe('http://runtime.test/api/chats/cht_1/activity/act_1');
    });
});
