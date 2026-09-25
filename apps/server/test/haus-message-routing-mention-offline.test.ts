import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

// No MessageRouter: the Server runs without a TypeSafe credential.
const fixture = agentCreationFixture();
let channelId: string;

beforeAll(async () => {
    channelId = (
        await fixture.owner.trpc.chat.createChannel.mutate({
            agentIds: [fixture.orbitAgentId, fixture.peerAgentId],
            name: 'offline-mentions',
            serverId: fixture.serverId,
        })
    ).id;
});

test('without a TypeSafe credential a mention keeps ordinary delivery', async () => {
    const receipt = await fixture.owner.trpc.chat.send.mutate({
        chatId: channelId,
        serverId: fixture.serverId,
        content: '@orbit please check the build.',
        nonce: 'offline_mention',
    });
    const rows = (await fixture.harness.sql`
        select agent_id as "agentId", mentioned
        from agent_inbox
        where server_id = ${fixture.serverId} and dedupe_key = ${receipt.message.id}
        order by agent_id
    `) as Array<{ agentId: string; mentioned: boolean }>;
    expect(rows).toEqual(
        [
            { agentId: fixture.orbitAgentId, mentioned: true },
            { agentId: fixture.peerAgentId, mentioned: false },
        ].sort((a, b) => a.agentId.localeCompare(b.agentId))
    );
    const { audit } = await fixture.owner.trpc.chat.messageRouting.query({
        serverId: fixture.serverId,
        messageId: receipt.message.id,
    });
    expect(audit).toMatchObject({ outcome: 'bypass', bypassReason: 'mention', model: null });
});
