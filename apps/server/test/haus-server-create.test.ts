import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
const openClients: HausClient[] = [];

beforeAll(async () => {
    harness = await startHausServerHarness();
});

afterAll(async () => {
    for (const client of openClients) {
        client.close();
    }

    await harness.close();
});

test('atomically creates a Server, its first Owner, #all, and private onboarding', async () => {
    const client = await signIn('user_cf_owner');

    const created = await client.trpc.server.create.mutate({
        displayName: 'Haus HQ',
        slug: 'haus-hq',
    });

    expect(created.slug).toBe('haus-hq');
    expect(created.displayName).toBe('Haus HQ');
    expect(created.role).toBe('owner');
    expect(created.id).not.toBe(created.slug);
    expect(created.id).toMatch(/^srv_[A-Za-z0-9_-]{16,}$/);
    expect(created.channels).toEqual([{ id: expect.any(String), name: 'all' }]);
    expect(created.onboarding).toEqual({
        agentId: null,
        applicationId: null,
        channelId: expect.any(String),
        computerId: null,
        failure: null,
        modelId: null,
        phase: 'awaiting-computer',
        runtimeId: null,
    });

    const rows = (await harness.sql`
        select chats.name, channel_participants.user_id
        from chats
        join channel_participants
          on channel_participants.server_id = chats.server_id
         and channel_participants.chat_id = chats.id
        where chats.server_id = ${created.id}
        order by chats.name
    `) as { name: string; user_id: string }[];
    expect(rows).toEqual([
        { name: 'all', user_id: created.viewerUserId },
        { name: 'onboarding-owner', user_id: created.viewerUserId },
    ]);
    await expect(client.trpc.chat.list.query({ serverId: created.id })).resolves.toMatchObject([
        { id: created.channels[0]?.id, name: 'all' },
    ]);

    await expect(client.trpc.server.list.query()).resolves.toEqual([
        { displayName: 'Haus HQ', id: created.id, role: 'owner', slug: 'haus-hq' },
    ]);
});

test('maps each Haus session of one external subject to the same user', async () => {
    const other = await signIn('user_cf_second');

    await other.trpc.server.create.mutate({ displayName: 'Second', slug: 'second' });

    const laterSession = await signIn('user_cf_second');
    const servers = await laterSession.trpc.server.list.query();

    expect(servers.map((server) => server.slug)).toEqual(['second']);
});

test('rejects a slug that is already taken', async () => {
    const client = await signIn('user_cf_taken');

    await expect(
        client.trpc.server.create.mutate({ displayName: 'Duplicate', slug: 'haus-hq' })
    ).rejects.toThrow(/already taken/i);
    await expect(client.trpc.server.list.query()).resolves.toEqual([]);
});

test('rejects a slug that is not a valid Server address', async () => {
    const client = await signIn('user_cf_invalid');

    await expect(
        client.trpc.server.create.mutate({ displayName: 'Bad', slug: 'Not A Slug' })
    ).rejects.toThrow();
});

test('creates no Computer or Agent alongside the Server', async () => {
    const client = await signIn('user_cf_bare');
    const created = await client.trpc.server.create.mutate({
        displayName: 'Bare',
        slug: 'bare',
    });

    expect(created.channels).toHaveLength(1);
    const [counts] = (await harness.sql`
        select
            (select count(*)::integer from server_onboarding where server_id = ${created.id})
                as onboarding_count,
            (select count(*)::integer from chats where server_id = ${created.id})
                as channel_count,
            (select count(*)::integer from computers where server_id = ${created.id})
                as computer_count,
            (select count(*)::integer from agents where server_id = ${created.id})
                as agent_count
    `) as {
        agent_count: number;
        channel_count: number;
        computer_count: number;
        onboarding_count: number;
    }[];
    expect(counts).toEqual({
        agent_count: 0,
        channel_count: 2,
        computer_count: 0,
        onboarding_count: 1,
    });
});

test('PostgreSQL refuses a Server role outside owner, admin, and member', async () => {
    const client = await signIn('user_cf_roles');
    const created = await client.trpc.server.create.mutate({
        displayName: 'Roles',
        slug: 'roles',
    });
    const writeIntruderRole = async () => {
        await harness.sql`
            update server_memberships set role = 'intruder' where server_id = ${created.id}
        `;
    };

    await expect(writeIntruderRole()).rejects.toThrow(/server_memberships_role/i);
    await expect(client.trpc.server.bySlug.query({ slug: 'roles' })).resolves.toMatchObject({
        role: 'owner',
    });
});

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    const client = createHausClient(harness, token);

    openClients.push(client);
    return client;
}
