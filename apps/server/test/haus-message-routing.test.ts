import { beforeAll, expect, test } from 'bun:test';
import type { MessageRouter, RoutingDecision, RoutingState } from '../src/message-routing/jev.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const calls: RoutingState[] = [];
let judge: (state: RoutingState) => Promise<RoutingDecision> = async () => ({
    kind: 'broadcast',
    reason: 'uncertain',
});
const router: MessageRouter = {
    async judge(state) {
        calls.push(state);
        return await judge(state);
    },
};
const fixture = agentCreationFixture(router);
const { recipients } = createInlineReplyHelpers(fixture);
let nonce = 0;
const send = (content: string) =>
    fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
        content,
        nonce: `routing_${nonce++}`,
    });
const narrow = async (): Promise<RoutingDecision> => ({
    kind: 'narrow',
    agentId: fixture.orbitAgentId,
    confidence: 0.99,
    probability: 0.99,
});

beforeAll(async () => {
    const runner = await fixture.mintRunner('run_routing_setup');
    await fixture.post('/api/agent/channels/add', runner, { agent: '@peer', target: '#product' });
    await send('@orbit, fix the CSV importer.');
});

test('routes without a Server allowlist, persists audit, and nonce replay never reclassifies', async () => {
    judge = narrow;
    const request = {
        chatId: fixture.channelId,
        serverId: fixture.serverId,
        content: 'Please check the export too.',
        nonce: 'routing_replay',
    };
    const before = calls.length;
    const first = await fixture.owner.trpc.chat.send.mutate(request);
    expect(await recipients(first.message.id)).toEqual([
        { agentId: fixture.orbitAgentId, mentioned: false },
    ]);
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.history.at(-1)?.explicitAgentIds).toContain(fixture.orbitAgentId);
    const audit = await fixture.harness
        .sql`select delivery_routing->>'outcome' as outcome, delivery_routing->>'model' as model, delivery_routing->'recipientAgentIds'->>0 as recipient from chat_messages where id=${first.message.id}`;
    expect(audit[0]).toMatchObject({
        outcome: 'narrow',
        recipient: fixture.orbitAgentId,
        model: 'jev-1.13.0',
    });
    judge = async () => {
        throw new Error('must not be called');
    };
    const replay = await fixture.owner.trpc.chat.send.mutate(request);
    expect(replay.idempotent).toBe(true);
    expect(calls.length).toBe(before + 1);
    expect(await recipients(first.message.id)).toHaveLength(1);
});

test('uncertainty, provider failure and out-of-candidate choices preserve broadcast', async () => {
    for (const decision of [
        { kind: 'broadcast', reason: 'uncertain' },
        { kind: 'broadcast', reason: 'failure' },
        { kind: 'narrow', agentId: 'agt_not_joined', confidence: 1, probability: 1 },
    ] satisfies RoutingDecision[]) {
        judge = async () => decision;
        const receipt = await send('Please investigate pricing too.');
        expect(await recipients(receipt.message.id)).toHaveLength(2);
    }
    judge = async () => {
        throw new Error('private provider details');
    };
    const receipt = await send('Another unaddressed request.');
    expect(await recipients(receipt.message.id)).toHaveLength(2);
    const rows = await fixture.harness
        .sql`select delivery_routing->>'outcome' as outcome, delivery_routing->>'model' as model, delivery_routing->'recipientAgentIds'->>0 as recipient from chat_messages where id=${receipt.message.id}`;
    expect(rows[0].outcome).toBe('failure');
    expect(JSON.stringify(rows)).not.toContain('private provider');
});

test('DMs, mentions, inline replies and unauthorized sends bypass inference', async () => {
    judge = narrow;
    const before = calls.length;
    const root = await send('@peer please check this.');
    // Existing mention semantics include ambient recipients; the router must preserve them.
    expect(await recipients(root.message.id)).toHaveLength(2);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
        content: 'And this too.',
        nonce: 'routing_reply',
        replyToMessageId: root.message.id,
    });
    const dm = await fixture.owner.trpc.chat.ensureAgentDm.mutate({
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.send.mutate({
        chatId: dm.id,
        serverId: fixture.serverId,
        content: 'Research pricing.',
        nonce: 'routing_dm',
    });
    await expect(
        fixture.outsider.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            serverId: fixture.serverId,
            content: 'private',
            nonce: 'routing_unauthorized',
        })
    ).rejects.toThrow();
    expect(calls.length).toBe(before);
});

test('debug reads expose the committed decision, timing and uncertain scores to authorized readers', async () => {
    judge = narrow;
    const receipt = await send('Please include the empty export case.');
    const input = { serverId: fixture.serverId, messageId: receipt.message.id };
    const debug = await fixture.owner.trpc.chat.messageRouting.query(input);
    expect(debug.audit).toMatchObject({
        outcome: 'narrow',
        recipientAgentIds: [fixture.orbitAgentId],
        choice: fixture.orbitAgentId,
        confidence: 0.99,
        probability: 0.99,
        threshold: 0.9,
    });
    expect(debug.audit?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(debug.agents.map((agent) => agent.displayName).sort()).toEqual(['Orbit', 'Peer']);
    await expect(fixture.outsider.trpc.chat.messageRouting.query(input)).rejects.toThrow();
    await expect(
        fixture.owner.trpc.chat.messageRouting.query({ ...input, serverId: fixture.otherServerId })
    ).rejects.toThrow();
    judge = async () => ({
        kind: 'broadcast',
        reason: 'uncertain',
        confidence: 0.83,
        probability: 0.83,
        choice: fixture.orbitAgentId,
    });
    const uncertain = await send('Tiny said the export has the same bug; check it too.');
    expect(
        (
            await fixture.owner.trpc.chat.messageRouting.query({
                ...input,
                messageId: uncertain.message.id,
            })
        ).audit
    ).toMatchObject({
        outcome: 'uncertain',
        confidence: 0.83,
        probability: 0.83,
    });
});

test('debug reads identify deterministic bypasses and never invent historical decisions', async () => {
    const mention = await send('@orbit please check the input too.');
    const input = { serverId: fixture.serverId, messageId: mention.message.id };
    expect((await fixture.owner.trpc.chat.messageRouting.query(input)).audit).toMatchObject({
        outcome: 'bypass',
        bypassReason: 'mention',
        model: null,
        elapsedMs: null,
    });
    const dm = await fixture.owner.trpc.chat.ensureAgentDm.mutate({
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    const receipt = await fixture.owner.trpc.chat.send.mutate({
        chatId: dm.id,
        serverId: fixture.serverId,
        content: 'Check the logs.',
        nonce: 'routing_debug_dm',
    });
    expect(
        (
            await fixture.owner.trpc.chat.messageRouting.query({
                ...input,
                messageId: receipt.message.id,
            })
        ).audit
    ).toMatchObject({
        outcome: 'bypass',
        bypassReason: 'direct-message',
        recipientAgentIds: [fixture.orbitAgentId],
    });
    await fixture.harness
        .sql`update chat_messages set delivery_routing = null where id = ${mention.message.id}`;
    expect(await fixture.owner.trpc.chat.messageRouting.query(input)).toEqual({
        audit: null,
        agents: [],
    });
});

test('a concurrent message does not wait for inference and invalidates the old snapshot', async () => {
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    judge = async (state) => {
        if (state.currentMessage.text === 'Delayed routing decision.') {
            entered();
            await waiting;
        }
        return await narrow();
    };
    const pending = send('Delayed routing decision.');
    await started;
    try {
        await send('@peer, an intervening request.');
    } finally {
        release();
    }
    const receipt = await pending;
    expect(await recipients(receipt.message.id)).toHaveLength(2);
    const rows = await fixture.harness
        .sql`select delivery_routing->>'outcome' as outcome, delivery_routing->>'model' as model, delivery_routing->'recipientAgentIds'->>0 as recipient from chat_messages where id=${receipt.message.id}`;
    expect(rows[0].outcome).toBe('stale');
});

test('a mute during inference cannot be bypassed by the selected Agent', async () => {
    const runner = await fixture.mintRunner('run_routing_mute');
    judge = async () => {
        await fixture.post('/api/agent/channels/mute', runner, { target: '#product' });
        return await narrow();
    };
    const receipt = await send('Please handle this too.');
    expect(await recipients(receipt.message.id)).toEqual([
        { agentId: fixture.peerAgentId, mentioned: false },
    ]);
    const before = calls.length;
    await send('Only one eligible Agent remains.');
    expect(calls.length).toBe(before);
});

test('a Server restart preserves the committed routing decision', async () => {
    const before = calls.length;
    await fixture.harness.restart();
    const resumed = await fixture.signIn('user_agent_creation_owner', ['ada@haus.test']);
    try {
        const replay = await resumed.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            serverId: fixture.serverId,
            content: 'Please check the export too.',
            nonce: 'routing_replay',
        });
        expect(replay.idempotent).toBe(true);
        expect(calls.length).toBe(before);
    } finally {
        resumed.close();
    }
});
