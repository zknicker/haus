import { beforeAll, expect, test } from 'bun:test';
import type { MessageRouter, RoutingState } from '../src/message-routing/jev.ts';
import type { MentionScopeDecision } from '../src/message-routing/mention-scope.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const scopeCalls: RoutingState[] = [];
let judgeScope: (state: RoutingState) => Promise<MentionScopeDecision> = async () => ({
    kind: 'broadcast',
    reason: 'uncertain',
});
const router: MessageRouter = {
    judge: () => {
        throw new Error('a mention must not ask the audience question');
    },
    async judgeMentionScope(state) {
        scopeCalls.push(state);
        return await judgeScope(state);
    },
};
const fixture = agentCreationFixture(router);
let nonce = 0;
let channelId: string;
const send = (content: string, extra: { replyToMessageId?: string } = {}) =>
    fixture.owner.trpc.chat.send.mutate({
        chatId: channelId,
        serverId: fixture.serverId,
        content,
        nonce: `mention_${nonce++}`,
        ...extra,
    });
const inbox = async (messageId: string) =>
    (await fixture.harness.sql`
        select agent_id as "agentId", mentioned, addressed_reason as "addressedReason"
        from agent_inbox
        where server_id = ${fixture.serverId} and dedupe_key = ${messageId}
        order by agent_id
    `) as Array<{ agentId: string; mentioned: boolean; addressedReason: string | null }>;
const audit = async (messageId: string) =>
    (await fixture.owner.trpc.chat.messageRouting.query({ serverId: fixture.serverId, messageId }))
        .audit;
const mentionedOnly = async (): Promise<MentionScopeDecision> => ({
    kind: 'mentioned',
    confidence: 0.97,
    probability: 0.98,
});

beforeAll(async () => {
    channelId = (
        await fixture.owner.trpc.chat.createChannel.mutate({
            agentIds: [fixture.orbitAgentId, fixture.peerAgentId, fixture.coveAgentId],
            name: 'mentions',
            serverId: fixture.serverId,
        })
    ).id;
});

test('a confident mention-only judgment delivers to the mentioned Agent alone', async () => {
    judgeScope = mentionedOnly;
    const receipt = await send('@orbit please fix the CSV importer.');
    expect(await inbox(receipt.message.id)).toEqual([
        { agentId: fixture.orbitAgentId, mentioned: true, addressedReason: 'mention' },
    ]);
    const state = scopeCalls.at(-1);
    expect(state?.currentMessage.explicitAgentIds).toEqual([fixture.orbitAgentId]);
    expect(state?.eligibleAgentIds).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId, fixture.coveAgentId].sort()
    );
    expect(await audit(receipt.message.id)).toMatchObject({
        outcome: 'mentioned',
        bypassReason: 'mention',
        promptVersion: 'mention-v2',
        model: 'jev-1.13.0',
        choice: 'mentioned',
        confidence: 0.97,
        probability: 0.98,
        threshold: 0.9,
        recipientAgentIds: [fixture.orbitAgentId],
    });
});

test('multiple mentions narrow to the mentioned set', async () => {
    judgeScope = mentionedOnly;
    const receipt = await send('@orbit @peer compare your notes on the importer.');
    expect(await inbox(receipt.message.id)).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId]
            .sort()
            .map((agentId) => ({ agentId, mentioned: true, addressedReason: 'mention' }))
    );
    expect(scopeCalls.at(-1)?.currentMessage.explicitAgentIds.sort()).toEqual(
        [fixture.orbitAgentId, fixture.peerAgentId].sort()
    );
});

test('others, uncertain, failed, timed-out and invalid judgments keep ordinary delivery', async () => {
    const decisions: [MentionScopeDecision | Error, string][] = [
        [
            {
                kind: 'broadcast',
                reason: 'uncertain',
                choice: 'others',
                confidence: 0.95,
                probability: 0.97,
            },
            'uncertain',
        ],
        [{ kind: 'broadcast', reason: 'failure' }, 'failure'],
        [{ kind: 'broadcast', reason: 'timeout' }, 'timeout'],
        [{ kind: 'broadcast', reason: 'invalid' }, 'invalid'],
        [new Error('provider detail'), 'failure'],
    ];
    for (const [decision, outcome] of decisions) {
        judgeScope = async () => {
            if (decision instanceof Error) {
                throw decision;
            }
            return decision;
        };
        const receipt = await send('@orbit take this, and everyone else note the freeze.');
        const rows = await inbox(receipt.message.id);
        expect(rows).toHaveLength(3);
        expect(rows.find((row) => row.agentId === fixture.orbitAgentId)).toMatchObject({
            mentioned: true,
            addressedReason: 'mention',
        });
        expect(rows.filter((row) => row.addressedReason === null)).toHaveLength(2);
        expect(await audit(receipt.message.id)).toMatchObject({
            outcome,
            bypassReason: 'mention',
            promptVersion: 'mention-v2',
        });
    }
});

test('mentioning every eligible Agent leaves nothing for Jev to narrow', async () => {
    const before = scopeCalls.length;
    const receipt = await send('@orbit @peer @cove post your standup.');
    expect(await inbox(receipt.message.id)).toHaveLength(3);
    expect(scopeCalls.length).toBe(before);
    expect(await audit(receipt.message.id)).toMatchObject({
        outcome: 'bypass',
        bypassReason: 'mention',
        model: null,
    });
});

test('a mention in an inline reply or a Thread keeps its deterministic bypass', async () => {
    judgeScope = mentionedOnly;
    const root = await send('A root for replies.');
    const before = scopeCalls.length;
    const reply = await send('@orbit look at this one.', { replyToMessageId: root.message.id });
    expect((await audit(reply.message.id))?.bypassReason).toBe('reply');
    const threaded = await fixture.owner.trpc.chat.send.mutate({
        chatId: channelId,
        serverId: fixture.serverId,
        content: '@orbit continue in the thread.',
        nonce: `mention_${nonce++}`,
        thread: { anchorMessageId: root.message.id },
    });
    expect((await audit(threaded.message.id))?.bypassReason).toBe('thread');
    expect(scopeCalls.length).toBe(before);
});

test('a message landing during inference discards the mention judgment', async () => {
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    judgeScope = async (state) => {
        if (state.currentMessage.text === '@orbit delayed judgment.') {
            entered();
            await waiting;
        }
        return await mentionedOnly();
    };
    const pending = send('@orbit delayed judgment.');
    await started;
    try {
        await send('@peer an intervening request.');
    } finally {
        release();
    }
    const receipt = await pending;
    expect(await inbox(receipt.message.id)).toHaveLength(3);
    expect((await audit(receipt.message.id))?.outcome).toBe('stale');
});
