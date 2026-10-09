import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const subscriptionTimeoutMs = 5000;

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
        select id from users where clerk_user_id = 'user_events_delete_peer'
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

    const subscription = subscribeToChatEvents(peer, serverId);
    await subscription.started;
    await owner.trpc.chat.deleteChannel.mutate({
        chatId: doomedChatId,
        confirmation: 'doomed',
        serverId,
    });

    await expect(subscription.nextEvent).resolves.toMatchObject({
        action: 'deleted',
        chatId: doomedChatId,
        serverId,
        type: 'chat.lifecycle',
    });
    peer.close();
});

function subscribeToChatEvents(client: HausClient, subscribedServerId: string) {
    const started = Promise.withResolvers<void>();
    const nextEvent = Promise.withResolvers<unknown>();
    const timeout = setTimeout(() => {
        nextEvent.reject(new Error('Timed out waiting for a durable Chat event.'));
    }, subscriptionTimeoutMs);
    const subscription = client.trpc.chat.onEvent.subscribe(
        { serverId: subscribedServerId },
        {
            onData: (event) => {
                clearTimeout(timeout);
                subscription.unsubscribe();
                nextEvent.resolve(event);
            },
            onError: (error) => {
                clearTimeout(timeout);
                started.reject(error);
                nextEvent.reject(error);
            },
            onStarted: () => started.resolve(),
        }
    );
    started.promise.catch(() => undefined);
    nextEvent.promise.catch(() => undefined);
    return { nextEvent: nextEvent.promise, started: started.promise };
}

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}
