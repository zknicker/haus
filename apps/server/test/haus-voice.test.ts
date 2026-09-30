import { afterAll, beforeAll, expect, test } from 'bun:test';
import { appProtocolHeaders, appProtocolVersion } from '@haus/api';
import { WebSocket, WebSocketServer } from 'ws';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let chatId: string;
let agentId: string;
let provider: WebSocket;
const upstream = new WebSocketServer({ port: 0 });
const received: Record<string, unknown>[] = [];

beforeAll(async () => {
    upstream.on('connection', (socket) => {
        provider = socket;
        socket.on('message', (bytes) => {
            const event = JSON.parse(bytes.toString()) as Record<string, unknown>;
            received.push(event);
            if (event.type === 'session.start') {
                socket.send(JSON.stringify({ type: 'session.started' }));
            }
            if (event.type === 'session.close') {
                socket.send(
                    JSON.stringify({
                        type: 'error',
                        error: {
                            code: 'session_closing',
                            message: 'A pending context append was rejected.',
                        },
                    })
                );
                socket.send(JSON.stringify({ type: 'session.closed' }));
            }
        });
    });
    const address = upstream.address();
    if (!address || typeof address === 'string') {
        throw new Error('Expected test socket address');
    }
    harness = await startHausServerHarness({
        openAiApiKey: 'test-only',
        connectLive: () => new WebSocket(`ws://127.0.0.1:${address.port}`),
    });
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_voice_owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Voice HQ', slug: 'voice-hq' })
    ).id;
    const [user] = await harness.sql`select id from users where clerk_user_id = 'user_voice_owner'`;
    const inventory = {
        runtimes: [
            {
                id: 'claude',
                label: 'Claude',
                models: [{ id: 'claude-opus', label: 'Claude Opus' }],
            },
        ],
    };
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values ('cmp_voiceaaaaaaaaaaa', ${serverId}, ${user.id}, ${'a'.repeat(64)}, ${inventory}::jsonb, 'healthy')
    `;
    agentId = (
        await owner.trpc.agent.create.mutate({
            computerId: 'cmp_voiceaaaaaaaaaaa',
            displayName: 'Scout',
            handle: 'scout',
            modelId: 'claude-opus',
            runtimeId: 'claude',
            serverId,
        })
    ).agent.id;
    chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
    await harness.sql`update agents set effective_model_id = 'claude-opus' where id = ${agentId}`;
}, 30_000);

afterAll(async () => {
    owner?.close();
    await harness?.close();
    for (const socket of upstream.clients) {
        socket.terminate();
    }
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

test('requires membership, private DM access, and the exact app protocol', async () => {
    await expect(rejectedCall(null)).resolves.toBe(403);
    const stranger = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_voice_stranger')
    );
    await stranger.trpc.server.create.mutate({ displayName: 'Stranger', slug: 'stranger' });
    await expect(rejectedCall(stranger.clerkSessionToken)).resolves.toBe(403);
    await expect(rejectedCall(owner.clerkSessionToken, appProtocolVersion + 1)).resolves.toBe(403);
    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (chat) => chat.kind === 'channel'
    );
    expect(channel).toBeDefined();
    await expect(
        rejectedCall(owner.clerkSessionToken, appProtocolVersion, channel!.id)
    ).resolves.toBe(403);
    stranger.close();
});

test('delegates once into the unchanged Claude session, speaks committed replies, and closes on rotation', async () => {
    const events: Record<string, unknown>[] = [];
    const socket = openCall(owner.clerkSessionToken);
    socket.on('message', (raw) => events.push(JSON.parse(raw.toString())));
    socket.on('error', () => {});
    try {
        await waitFor(() => events.some((event) => event.type === 'ready'));
        const initial = (
            await harness.sql`select session_generation, desired_model_id from agents where id = ${agentId}`
        )[0];
        const delegation = {
            type: 'session.delegation.created',
            delegation: { id: 'voice-test', target: 'client' },
        };
        provider.send(JSON.stringify(delegation));
        provider.send(
            JSON.stringify({
                type: 'session.input_transcript.delta',
                delta: 'Please review the launch copy.',
            })
        );
        provider.send(JSON.stringify(delegation));
        await waitFor(
            async () =>
                (await harness.sql`select id from chat_messages where chat_id = ${chatId}`)
                    .length === 1
        );
        const messages =
            await harness.sql`select content, author_user_id from chat_messages where chat_id = ${chatId}`;
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('Please review the launch copy.');
        expect(messages[0].author_user_id).toBeTruthy();
        expect(
            await harness.sql`select id from agent_inbox where agent_id = ${agentId}`
        ).toHaveLength(1);
        expect(
            (
                await harness.sql`select session_generation, desired_model_id from agents where id = ${agentId}`
            )[0]
        ).toEqual(initial);
        await harness.sql`
            insert into chat_messages (id, server_id, chat_id, author_agent_id, content, nonce, sequence)
            values ('msg_voice_reply', ${serverId}, ${chatId}, ${agentId}, 'The launch copy needs a clearer headline.', 'reply', 2)
        `;
        await waitFor(() =>
            received.some(
                (event) =>
                    event.type === 'session.commentary.append' &&
                    event.content === 'The launch copy needs a clearer headline.'
            )
        );
        provider.send(JSON.stringify({ type: 'session.output_audio.delta', delta: 'AAA=' }));
        await waitFor(() =>
            events.some((event) => event.type === 'audio' && event.audio === 'AAA=')
        );
        socket.send(JSON.stringify({ type: 'mute', muted: true }));
        await waitFor(() => received.some((event) => event.type === 'session.input_audio.mute'));
        await harness.sql`update agents set session_generation = session_generation + 1 where id = ${agentId}`;
        await waitFor(() => events.some((event) => event.type === 'closed'));
        expect(events.some((event) => event.type === 'error')).toBe(true);
    } finally {
        socket.terminate();
    }
}, 15_000);

test('hangup gracefully closes the Live session', async () => {
    const events: Record<string, unknown>[] = [];
    const socket = openCall(owner.clerkSessionToken);
    socket.on('message', (raw) => events.push(JSON.parse(raw.toString())));
    socket.on('error', () => {});
    try {
        await waitFor(() => events.some((event) => event.type === 'ready'));
        socket.send(JSON.stringify({ type: 'close' }));
        await waitFor(() => events.some((event) => event.type === 'closed'));
        expect(received.some((event) => event.type === 'session.close')).toBe(true);
        expect(events.some((event) => event.type === 'error')).toBe(false);
    } finally {
        socket.terminate();
    }
});

test('Server shutdown releases an active call before tearing down its database', async () => {
    const events: Record<string, unknown>[] = [];
    const socket = openCall(owner.clerkSessionToken);
    socket.on('message', (raw) => events.push(JSON.parse(raw.toString())));
    socket.on('error', () => {});
    try {
        await waitFor(() => events.some((event) => event.type === 'ready'));
        const activeProvider = provider;
        await harness.restart();
        await waitFor(() => activeProvider.readyState === WebSocket.CLOSED);
        expect(socket.readyState).toBe(WebSocket.CLOSED);
    } finally {
        socket.terminate();
    }
});

function openCall(token: string | null, protocol = appProtocolVersion, targetChat = chatId) {
    const url = new URL('/voice/call', harness.url);
    url.protocol = 'ws:';
    url.searchParams.set('serverId', serverId);
    url.searchParams.set('chatId', targetChat);
    return new WebSocket(url, {
        headers: {
            Origin: harness.appOrigin,
            [appProtocolHeaders.productVersion]: 'test',
            [appProtocolHeaders.protocolVersion]: String(protocol),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
    });
}

function rejectedCall(token: string | null, protocol = appProtocolVersion, targetChat = chatId) {
    return new Promise<number>((resolve, reject) => {
        const socket = openCall(token, protocol, targetChat);
        socket.on('unexpected-response', (_, response) => {
            response.resume();
            socket.terminate();
            resolve(response.statusCode ?? 0);
        });
        socket.on('error', () => {});
        socket.on('open', () => {
            socket.terminate();
            reject(new Error('Unauthorized socket opened'));
        });
    });
}

async function waitFor(check: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
        if (await check()) {
            return;
        }
        await Bun.sleep(25);
    }
    throw new Error('Voice condition timed out');
}
