import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('membership alone does not expose another human’s private DM routing', async () => {
    const [peer] = await fixture.harness
        .sql`select id from users where clerk_user_id = 'user_agent_creation_outsider'`;
    await fixture.harness.sql`insert into server_memberships (id, server_id, user_id, role)
        values ('mem_routing_debug_peer', ${fixture.serverId}, ${peer.id}, 'member')`;
    const dm = await fixture.owner.trpc.chat.ensureAgentDm.mutate({
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    const receipt = await fixture.owner.trpc.chat.send.mutate({
        serverId: fixture.serverId,
        chatId: dm.id,
        content: 'Private follow-up.',
        nonce: 'routing_private',
    });
    const input = { serverId: fixture.serverId, messageId: receipt.message.id };
    expect((await fixture.owner.trpc.chat.messageRouting.query(input)).audit?.bypassReason).toBe(
        'direct-message'
    );
    await expect(fixture.outsider.trpc.chat.messageRouting.query(input)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
});
