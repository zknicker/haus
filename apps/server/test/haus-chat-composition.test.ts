import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let peer: HausClient;
let chatId: string;
let peerUserId: string;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_composition_owner');
    peer = await signIn('user_composition_peer');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Composition Server',
        slug: 'composition-server',
    });
    await peer.trpc.server.create.mutate({
        displayName: 'Composition Peer',
        slug: 'composition-peer',
    });
    const [peerUser] = (await harness.sql`
        select id from users where auth_subject = 'user_composition_peer'
    `) as { id: string }[];

    chatId = server.channels[0].id;
    peerUserId = peerUser.id;
    serverId = server.id;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_composition_peer', ${serverId}, ${peerUserId}, 'member')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${chatId}, ${peerUserId})
    `;
});

afterAll(async () => {
    owner.close();
    peer.close();
    await harness.close();
});

test('composition is best-effort, live-only, and never persisted', async () => {
    const realtime = captureAllTopics();
    await owner.trpc.chat.publishComposition.mutate({
        chatId,
        compositionId: 'composition-before-subscribe',
        serverId,
        text: 'not replayed',
    });

    const subscription = subscribeToComposition(peer, chatId, serverId);
    await subscription.started;
    await expect(subscription.noEventFor(100)).resolves.toBeUndefined();

    await owner.trpc.chat.publishComposition.mutate({
        chatId,
        compositionId: 'composition-live',
        serverId,
        text: 'live draft',
    });
    await expect(subscription.nextEvent).resolves.toMatchObject({
        chatId,
        compositionId: 'composition-live',
        serverId,
        text: 'live draft',
    });

    // Composition announces nothing on any realtime topic.
    expect(await publishedSince(realtime, serverId)).toEqual([]);
    realtime.stop();
});

test('composition delivery fails once membership is revoked', async () => {
    const subscription = subscribeToComposition(peer, chatId, serverId);
    await subscription.started;
    await harness.sql`
        update server_memberships set revoked_at = now()
        where server_id = ${serverId} and user_id = ${peerUserId}
    `;
    await owner.trpc.chat.publishComposition.mutate({
        chatId,
        compositionId: 'composition-revoked',
        serverId,
        text: 'must not arrive',
    });

    await expect(subscription.nextEvent).rejects.toThrow(/member/i);
});

const subscriptionTimeoutMs = 5000;

function subscribeToComposition(
    client: HausClient,
    subscribedChatId: string,
    subscribedServerId: string
) {
    const started = Promise.withResolvers<void>();
    const nextEvent = Promise.withResolvers<unknown>();
    const subscription = client.trpc.chat.onComposition.subscribe(
        { chatId: subscribedChatId, serverId: subscribedServerId },
        {
            onData: (event) => nextEvent.resolve(event),
            onError: (error) => {
                started.reject(error);
                nextEvent.reject(error);
            },
            onStarted: () => started.resolve(),
        }
    );
    const timeout = setTimeout(() => {
        subscription.unsubscribe();
        nextEvent.reject(new Error('Timed out waiting for a composition event.'));
    }, subscriptionTimeoutMs);

    started.promise.catch(() => undefined);
    nextEvent.promise.finally(() => clearTimeout(timeout)).catch(() => undefined);
    return {
        nextEvent: nextEvent.promise,
        noEventFor: async (milliseconds: number) => {
            await Promise.race([
                nextEvent.promise.then(() => {
                    throw new Error('Received a replayed composition event.');
                }),
                Bun.sleep(milliseconds),
            ]);
        },
        started: started.promise,
    };
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}
