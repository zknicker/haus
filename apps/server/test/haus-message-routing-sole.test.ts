import { beforeAll, expect, test } from 'bun:test';
import type { MessageRouter, RoutingDecision, RoutingState } from '../src/message-routing/jev.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const calls: RoutingState[] = [];
let judge: (state: RoutingState) => Promise<RoutingDecision> = async () => {
    throw new Error('a sole channel must not call Jev');
};
const router: MessageRouter = {
    async judge(state) {
        calls.push(state);
        return await judge(state);
    },
};
const fixture = agentCreationFixture(router);
let nonce = 0;
const send = (content: string, extra: { replyToMessageId?: string } = {}) =>
    fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
        content,
        nonce: `sole_${nonce++}`,
        ...extra,
    });
const inbox = async (messageId: string) =>
    (await fixture.harness.sql`
        select agent_id as "agentId", addressed_reason as "addressedReason", expects_reply as "expectsReply"
        from agent_inbox
        where server_id = ${fixture.serverId} and dedupe_key = ${messageId}
        order by agent_id
    `) as Array<{ addressedReason: string | null; agentId: string; expectsReply: number | null }>;
const audit = async (messageId: string) =>
    (await fixture.owner.trpc.chat.messageRouting.query({ serverId: fixture.serverId, messageId }))
        .audit;

beforeAll(async () => {
    // #product holds Orbit alone; the owner is its only human member.
    await send('Kicking off the importer work.');
});

test('the sole Agent of a one-human channel is addressed without a Jev call', async () => {
    const receipt = await send('Can you check the CSV importer?');
    expect(await inbox(receipt.message.id)).toEqual([
        { addressedReason: 'sole', agentId: fixture.orbitAgentId, expectsReply: null },
    ]);
    expect(await audit(receipt.message.id)).toMatchObject({
        bypassReason: 'sole',
        model: null,
        outcome: 'bypass',
    });
    expect(calls).toHaveLength(0);
});

test('mentions, inline replies and DMs keep their own deterministic reasons', async () => {
    const mention = await send('@orbit please look at pricing.');
    expect((await inbox(mention.message.id))[0]?.addressedReason).toBe('mention');
    const reply = await send('And the export.', { replyToMessageId: mention.message.id });
    expect((await audit(reply.message.id))?.bypassReason).toBe('reply');
    expect((await inbox(reply.message.id))[0]?.addressedReason).not.toBe('sole');
    const dm = await fixture.owner.trpc.chat.ensureAgentDm.mutate({
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    const direct = await fixture.owner.trpc.chat.send.mutate({
        chatId: dm.id,
        serverId: fixture.serverId,
        content: 'Research pricing.',
        nonce: 'sole_dm',
    });
    expect((await inbox(direct.message.id))[0]?.addressedReason).toBe('dm');
    expect(calls).toHaveLength(0);
});

test('with a second human, Jev decides the one Agent at the gate and recipients never change', async () => {
    const userId = 'usr_sole_second_human';
    await fixture.harness.sql`insert into users (id, clerk_user_id, display_name)
        values (${userId}, 'clerk_sole_second_human', 'Bea')`;
    await fixture.harness.sql`insert into server_memberships (id, server_id, user_id, role)
        values ('mem_sole_second_human', ${fixture.serverId}, ${userId}, 'member')`;
    await fixture.harness.sql`insert into channel_participants (server_id, chat_id, user_id)
        values (${fixture.serverId}, ${fixture.channelId}, ${userId})`;

    judge = async () => ({
        kind: 'narrow',
        agentId: fixture.orbitAgentId,
        confidence: 0.97,
        probability: 0.96,
        expectsReply: 0.125,
    });
    const addressed = await send('Orbit, can you rerun the import?');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.eligibleAgentIds).toEqual([fixture.orbitAgentId]);
    // The silent member is still a participant Jev can name as the addressee.
    expect(calls[0]?.channel.participants.map((row) => row.id)).toContain(userId);
    expect(await inbox(addressed.message.id)).toEqual([
        { addressedReason: 'routing', agentId: fixture.orbitAgentId, expectsReply: 0.125 },
    ]);

    for (const decision of [
        { kind: 'broadcast', reason: 'uncertain', choice: 'human', expectsReply: 0.5 },
        { kind: 'broadcast', reason: 'timeout' },
    ] satisfies RoutingDecision[]) {
        judge = async () => decision;
        const receipt = await send('Bea, did the import finish on your side?');
        expect(await inbox(receipt.message.id)).toEqual([
            {
                addressedReason: null,
                agentId: fixture.orbitAgentId,
                expectsReply: decision.expectsReply ?? null,
            },
        ]);
    }
    expect(calls).toHaveLength(3);
});
