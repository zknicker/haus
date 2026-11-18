import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

interface Lane {
    client: HausClient;
    harness: HausServerHarness;
    serverId: string;
}

let production: Lane;
let development: Lane;

beforeAll(async () => {
    production = await openLane(await startHausServerHarness(), 'advent-preview-prod');
    development = await openLane(
        await startHausServerHarness({ enableDevelopmentAuth: true }),
        'advent-preview-dev'
    );
});

afterAll(async () => {
    for (const lane of [production, development]) {
        lane?.client.close();
        await lane?.harness.close();
    }
});

test('without development auth, an unopened door stays shut', async () => {
    await expect(
        production.client.trpc.advent.calendar.query({
            serverId: production.serverId,
            throughDay: 25,
            timeZone: 'UTC',
            year: 2100,
        })
    ).rejects.toThrow(/not opened yet/);
});

test('a development Server previews any door out of season', async () => {
    const calendar = await development.client.trpc.advent.calendar.query({
        serverId: development.serverId,
        throughDay: 25,
        timeZone: 'UTC',
        year: 2100,
    });
    expect(calendar.entries).toHaveLength(24);
    expect(calendar.entries.at(-1)).toMatchObject({ fact: 'recap', kind: 'recap' });
});

async function openLane(harness: HausServerHarness, slug: string): Promise<Lane> {
    const subject = `user_${slug}`;
    harness.humans.setVerifiedEmails(subject, [`${slug}@example.com`]);
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    const server = await client.trpc.server.create.mutate({ displayName: slug, slug });
    return { client, harness, serverId: server.id };
}
