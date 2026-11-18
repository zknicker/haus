import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
const openClients: HausClient[] = [];

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_cf_access_owner');
    await owner.trpc.server.create.mutate({ displayName: 'Haus HQ', slug: 'haus-hq' });
    await owner.trpc.server.create.mutate({ displayName: 'Side Quest', slug: 'side-quest' });
});

afterAll(async () => {
    for (const client of openClients) {
        client.close();
    }

    await harness.close();
});

test('opens a Server by slug with #all', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'haus-hq' });

    expect(server.slug).toBe('haus-hq');
    expect(server.displayName).toBe('Haus HQ');
    expect(server.role).toBe('owner');
    expect(server.channels.map((channel) => channel.name)).toEqual(['all']);
});

test('switches between the Servers a human can access', async () => {
    const servers = await owner.trpc.server.list.query();

    expect(servers.map((server) => server.slug)).toEqual(['haus-hq', 'side-quest']);

    const switched = await owner.trpc.server.bySlug.query({ slug: 'side-quest' });

    expect(switched.displayName).toBe('Side Quest');
});

test('edits the display name while the slug stays the address', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'side-quest' });
    const renamed = await owner.trpc.server.rename.mutate({
        displayName: 'Side Quests',
        serverId: server.id,
    });

    expect(renamed).toMatchObject({
        displayName: 'Side Quests',
        id: server.id,
        slug: 'side-quest',
    });
    await expect(owner.trpc.server.bySlug.query({ slug: 'side-quest' })).resolves.toMatchObject({
        displayName: 'Side Quests',
    });
});

test('exposes no way to change an immutable Server slug', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'haus-hq' });

    await expect(
        owner.trpc.server.rename.mutate({
            displayName: 'Haus HQ',
            serverId: server.id,
            slug: 'renamed-hq',
        } as never)
    ).rejects.toThrow(/unrecognized key|slug/i);
    await expect(owner.trpc.server.bySlug.query({ slug: 'renamed-hq' })).rejects.toThrow();
    await expect(owner.trpc.server.bySlug.query({ slug: 'haus-hq' })).resolves.toMatchObject({
        id: server.id,
    });
});

test('denies a human without membership every Server boundary', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'haus-hq' });
    const outsider = await signIn('user_cf_outsider');

    await expect(outsider.trpc.server.list.query()).resolves.toEqual([]);
    await expect(outsider.trpc.server.bySlug.query({ slug: 'haus-hq' })).rejects.toThrow(
        /not a member/i
    );
    await expect(
        outsider.trpc.server.rename.mutate({ displayName: 'Mine now', serverId: server.id })
    ).rejects.toThrow(/not a member/i);
    await expect(subscribeToServer(outsider, server.id).started).rejects.toThrow(/not a member/i);

    await expect(owner.trpc.server.bySlug.query({ slug: 'haus-hq' })).resolves.toMatchObject({
        displayName: 'Haus HQ',
    });
});

test('delivers Server updates to a member subscription', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'haus-hq' });
    const subscription = subscribeToServer(owner, server.id);

    await subscription.started;
    await owner.trpc.server.rename.mutate({ displayName: 'Haus HQ 2', serverId: server.id });
    await expect(subscription.nextEvent).resolves.toMatchObject({ serverId: server.id });

    await owner.trpc.server.rename.mutate({ displayName: 'Haus HQ', serverId: server.id });
});

const subscriptionTimeoutMs = 5000;

function subscribeToServer(client: HausClient, serverId: string) {
    const started = Promise.withResolvers<void>();
    const nextEvent = Promise.withResolvers<{ serverId: string }>();
    const timeout = setTimeout(() => {
        nextEvent.reject(new Error('Timed out waiting for a Server update.'));
    }, subscriptionTimeoutMs);
    const subscription = client.trpc.server.onUpdated.subscribe(
        { serverId },
        {
            onData: (event) => {
                clearTimeout(timeout);
                subscription.unsubscribe();
                nextEvent.resolve(event as { serverId: string });
            },
            onError: (error) => {
                clearTimeout(timeout);
                started.reject(error);
                nextEvent.reject(error);
            },
            onStarted: () => started.resolve(),
        }
    );

    // Both promises settle from the same stream; keep the unread one silent.
    started.promise.catch(() => undefined);
    nextEvent.promise.catch(() => undefined);

    return { nextEvent: nextEvent.promise, started: started.promise };
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    const client = createHausClient(harness, token);

    openClients.push(client);
    return client;
}
