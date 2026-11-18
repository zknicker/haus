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

test('rejects Server reads without a Haus session', async () => {
    const client = createHausClient(harness);
    await expect(client.trpc.server.list.query()).rejects.toThrow(/sign in/i);
    client.close();
});

test('the same external subject always resolves to one canonical Haus user', async () => {
    const first = await signIn('cf:stable-human');
    const userId = harness.humans.userIdForSubject('cf:stable-human');
    await first.trpc.server.create.mutate({ displayName: 'Stable', slug: 'stable' });

    const nextSessionToken = await harness.humans.mintSessionToken('cf:stable-human', {
        newSession: true,
    });
    const next = createHausClient(harness, nextSessionToken);
    openClients.push(next);

    expect(harness.humans.userIdForSubject('cf:stable-human')).toBe(userId);
    await expect(next.trpc.server.list.query()).resolves.toMatchObject([{ slug: 'stable' }]);
    await expect(countUsers('cf:stable-human')).resolves.toBe(1);
});

test('Server creation rollback leaves the already-mapped Haus user intact', async () => {
    const existing = await signIn('cf:first-human');
    await existing.trpc.server.create.mutate({ displayName: 'Taken', slug: 'taken' });

    const newcomer = await signIn('cf:new-human');
    await expect(countUsers('cf:new-human')).resolves.toBe(1);
    await expect(
        newcomer.trpc.server.create.mutate({ displayName: 'Also taken', slug: 'taken' })
    ).rejects.toThrow(/already taken/i);
    await expect(countUsers('cf:new-human')).resolves.toBe(1);

    const created = await newcomer.trpc.server.create.mutate({
        displayName: 'Fresh',
        slug: 'fresh',
    });
    expect(created.role).toBe('owner');
    await expect(countUsers('cf:new-human')).resolves.toBe(1);
});

async function signIn(subject: string) {
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    openClients.push(client);
    return client;
}

async function countUsers(subject: string) {
    const rows = (await harness.sql`
        select count(*)::int as total from users where auth_subject = ${subject}
    `) as { total: number }[];
    return rows[0].total;
}
