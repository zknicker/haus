import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_lifecycle_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Lifecycle Server',
        slug: 'lifecycle-server',
    });
    serverId = server.id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('a deleted channel reaches every Server member live, participant or not', async () => {
    const peer = await signIn('user_events_delete_peer');
    await peer.trpc.server.create.mutate({
        displayName: 'Delete Peer Root',
        slug: 'events-delete-peer',
    });
    const [peerUser] = (await harness.sql`
        select id from users where auth_subject = 'user_events_delete_peer'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_events_delete_peer', ${serverId}, ${peerUser.id}, 'member')
    `;
    const doomedChatId = 'cht_events_doomed';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${doomedChatId}, ${serverId}, 'channel', 'doomed')
    `;

    const lifecycle = collectStream(peer.trpc.chat.onLifecycle, { serverId });
    await lifecycle.started;
    await owner.trpc.chat.deleteChannel.mutate({
        chatId: doomedChatId,
        confirmation: 'doomed',
        serverId,
    });

    await expect(lifecycle.next()).resolves.toEqual({
        action: 'deleted',
        chatId: doomedChatId,
        serverId,
    });
    lifecycle.stop();
    peer.close();
});

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}
