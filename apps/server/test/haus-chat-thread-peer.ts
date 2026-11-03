import { createHausClient } from './haus-client.ts';
import type { HausServerHarness } from './haus-server-harness.ts';

export async function addThreadPeerToChannel(
    harness: HausServerHarness,
    serverId: string,
    chatId: string
) {
    const peerToken = await harness.humans.mintSessionToken('user_thread_peer');
    const client = createHausClient(harness, peerToken);
    await client.trpc.server.create.mutate({
        displayName: 'Thread Peer Root',
        slug: 'thread-peer-root',
    });
    const [{ id: peerUserId }] = (await harness.sql`
        select id from users where auth_subject = 'user_thread_peer'
    `) as { id: string }[];
    const [{ id: ownerUserId }] = (await harness.sql`
        select id from users where auth_subject = 'user_thread_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_thread_peer', ${serverId}, ${peerUserId}, 'member')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;
    return { client, ownerUserId };
}
