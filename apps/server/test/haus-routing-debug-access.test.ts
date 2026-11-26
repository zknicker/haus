import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('membership alone does not expose another human’s private DM routing', async () => {
    const [peer] = await fixture.harness
        .sql`select id from users where auth_subject = 'user_agent_creation_outsider'`;
    await fixture.harness.sql`insert into server_memberships (id, server_id, user_id, role, handle)
        values ('mem_routing_debug_peer', ${fixture.serverId}, ${peer.id}, 'member', 'cass')`;
    const bystander = await fixture.signIn('user_routing_bystander', ['dee@haus.test']);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'dee@haus.test',
        serverId: fixture.serverId,
    });
    await bystander.trpc.invitation.accept.mutate({ token });
    const dm = await fixture.owner.trpc.chat.ensureDm.mutate({
        peerUserId: peer.id,
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
    await expect(bystander.trpc.chat.messageRouting.query(input)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
    bystander.close();
});
