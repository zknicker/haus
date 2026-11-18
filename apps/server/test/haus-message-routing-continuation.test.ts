import { beforeAll, expect, test } from 'bun:test';
import type { MessageRouter, RoutingDecision, RoutingState } from '../src/message-routing/jev.ts';
import type { MentionScopeDecision } from '../src/message-routing/mention-scope.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

// Golden #joy-haus-ops exchange (2026-10-08): one human, Beacon and Juniper. The human
// @mentions Beacon about ads, Beacon answers, then the human follows up with no mention.
// Server owns the follow-up only through the Jev audience question (ADR 0030): a confident
// sole-addressee judgment narrows delivery to Beacon. Every non-narrowing outcome delivers
// to both, and Juniper staying quiet is then the Agent's own judgment, not routing.
const followUp =
    'How are we looking compared to this time last year? Like, are we way underdoing it on the effectiveness of our Halloween ads, or is it kind of on target?';

const audienceCalls: RoutingState[] = [];
const scopeCalls: RoutingState[] = [];
let judge: (state: RoutingState) => Promise<RoutingDecision> = async () => ({
    kind: 'broadcast',
    reason: 'uncertain',
});
const router: MessageRouter = {
    async judge(state) {
        audienceCalls.push(state);
        return await judge(state);
    },
    async judgeMentionScope(state): Promise<MentionScopeDecision> {
        scopeCalls.push(state);
        return { kind: 'mentioned', confidence: 0.96, probability: 0.97 };
    },
};
const fixture = agentCreationFixture(router);
const { sendAgentMessage } = createInlineReplyHelpers(fixture);
let nonce = 0;
let channelId: string;
let beaconId: string;
let juniperId: string;
let mentionId: string;
let digestId: string;

const send = (content: string) =>
    fixture.owner.trpc.chat.send.mutate({
        chatId: channelId,
        serverId: fixture.serverId,
        content,
        nonce: `continuation_${nonce++}`,
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
const narrowTo = (agentId: () => string) => async (): Promise<RoutingDecision> => ({
    kind: 'narrow',
    agentId: agentId(),
    confidence: 0.93,
    probability: 0.94,
});

beforeAll(async () => {
    beaconId = await fixture.createAgent('Beacon', 'beacon');
    juniperId = await fixture.createAgent('Juniper', 'juniper');
    channelId = (
        await fixture.owner.trpc.chat.createChannel.mutate({
            agentIds: [beaconId, juniperId],
            name: 'joy-haus-ops',
            serverId: fixture.serverId,
        })
    ).id;
    mentionId = (await send('@beacon how are our ads doing this week?')).message.id;
    const runner = await fixture.mintRunner('run_continuation_beacon', beaconId, channelId);
    const digest = await sendAgentMessage(runner.token, {
        content: 'Ads digest: spend $412, ACoS 31%, Halloween tees carrying most of the sales.',
        nonce: 'continuation_digest',
        target: '#joy-haus-ops',
    });
    expect(digest.status).toBe(200);
    digestId = digest.body.message?.id ?? '';
    expect(digestId).not.toBe('');
});

test('an @mention in a one-human, two-Agent channel wakes only the mentioned Agent', async () => {
    expect(await inbox(mentionId)).toEqual([
        { agentId: beaconId, mentioned: true, addressedReason: 'mention' },
    ]);
    expect(scopeCalls[0]?.currentMessage.explicitAgentIds).toEqual([beaconId]);
    expect(scopeCalls[0]?.eligibleAgentIds).toEqual([beaconId, juniperId].sort());
    expect(await audit(mentionId)).toMatchObject({
        outcome: 'mentioned',
        bypassReason: 'mention',
        recipientAgentIds: [beaconId],
    });
});

test('an unmentioned follow-up to the Beacon exchange narrows to Beacon on a confident judgment', async () => {
    judge = narrowTo(() => beaconId);
    const before = audienceCalls.length;
    const receipt = await send(followUp);
    expect(audienceCalls.length).toBe(before + 1);
    // Jev sees the evidence it needs: the @Beacon ask and Beacon's own answer.
    const state = audienceCalls.at(-1);
    expect(state?.currentMessage).toMatchObject({ text: followUp, explicitAgentIds: [] });
    expect(state?.eligibleAgentIds).toEqual([beaconId, juniperId].sort());
    expect(
        state?.history.map(({ id, authorId, explicitAgentIds }) => ({
            id,
            authorId,
            explicitAgentIds,
        }))
    ).toEqual([
        { id: mentionId, authorId: fixture.ownerUserId, explicitAgentIds: [beaconId] },
        { id: digestId, authorId: beaconId, explicitAgentIds: [] },
    ]);
    // Addressed, so a cold Beacon drains the body (ADR 0034); Juniper is never woken.
    expect(await inbox(receipt.message.id)).toEqual([
        { agentId: beaconId, mentioned: false, addressedReason: 'routing' },
    ]);
    expect(await audit(receipt.message.id)).toMatchObject({
        outcome: 'narrow',
        choice: beaconId,
        recipientAgentIds: [beaconId],
        threshold: 0.8,
    });
});

test('a non-narrowing judgment delivers the follow-up to both Agents unaddressed', async () => {
    for (const decision of [
        { kind: 'broadcast', reason: 'uncertain', choice: beaconId, confidence: 0.74 },
        { kind: 'broadcast', reason: 'kept', choice: 'multiple', confidence: 0.9 },
        { kind: 'broadcast', reason: 'timeout' },
    ] satisfies RoutingDecision[]) {
        judge = async () => decision;
        const receipt = await send(followUp);
        // Juniper still receives it; staying quiet here is the Agent's call, not routing.
        expect(await inbox(receipt.message.id)).toEqual(
            [beaconId, juniperId]
                .sort()
                .map((agentId) => ({ agentId, mentioned: false, addressedReason: null }))
        );
    }
});

test('a follow-up addressed to Juniper does not wake Beacon', async () => {
    judge = narrowTo(() => juniperId);
    const receipt = await send('Juniper, can you refresh the October inventory forecast?');
    expect(await inbox(receipt.message.id)).toEqual([
        { agentId: juniperId, mentioned: false, addressedReason: 'routing' },
    ]);
});
