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
    `) as Array<{ agentId: string; mentioned: boolean }>;
    // Which rows exist is the point, not their order: sort both sides in JS so neither
    // Postgres collation nor locale rules decide it.
    expect(rows.toSorted(byAgentId)).toEqual(
        [
            { agentId: fixture.orbitAgentId, mentioned: true },
            { agentId: fixture.peerAgentId, mentioned: false },
        ].toSorted(byAgentId)
    );
    const { audit } = await fixture.owner.trpc.chat.messageRouting.query({
        serverId: fixture.serverId,
        messageId: receipt.message.id,
    });
    expect(audit).toMatchObject({ outcome: 'bypass', bypassReason: 'mention', model: null });
});

function byAgentId(a: { agentId: string }, b: { agentId: string }) {
    if (a.agentId === b.agentId) {
        return 0;
    }
    return a.agentId < b.agentId ? -1 : 1;
}
