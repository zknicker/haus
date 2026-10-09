import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ServerUpdatedEvent } from '@haus/api';
import { subscribeToServerUpdates } from '../src/haus-api/server-events.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// Every App load syncs the Clerk identity. Only a sync that writes something
// may wake every member's App with a profile refresh.
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
const announced: ServerUpdatedEvent[] = [];
const stopWatching = new AbortController();

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('clerk_quiet_sync'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Quiet Sync', slug: 'quiet-sync' })
    ).id;
    void (async () => {
        try {
            for await (const event of subscribeToServerUpdates(stopWatching.signal)) {
                if (event.serverId === serverId) {
                    announced.push(event);
                }
            }
        } catch {
            // Aborted at teardown.
        }
    })();
});

afterAll(async () => {
    stopWatching.abort();
    owner?.close();
    await harness?.close();
});

const identity = {
    email: 'quiet@haus.test',
    name: 'Quiet Ada',
    timezone: 'America/New_York',
};

test('the first identity sync fills the profile and announces it', async () => {
    await owner.trpc.member.syncIdentity.mutate({ ...identity, serverId });
    await settle();
    expect(announced.map((event) => event.scope)).toEqual(['server']);
    expect(announced[0]?.memberId).toBeString();
});

test('an identical identity sync on the next App load announces nothing', async () => {
    const before = announced.length;
    await owner.trpc.member.syncIdentity.mutate({ ...identity, serverId });
    await owner.trpc.member.syncIdentity.mutate({ ...identity, serverId });
    // A sign-in from another device only fills blanks the human already owns.
    await owner.trpc.member.syncIdentity.mutate({
        ...identity,
        name: 'Someone Else',
        serverId,
        timezone: 'Asia/Tokyo',
    });
    await settle();
    expect(announced.length).toBe(before);
});

test('a changed email is a real write and announces once', async () => {
    const before = announced.length;
    await owner.trpc.member.syncIdentity.mutate({
        ...identity,
        email: 'quiet.ada@haus.test',
        serverId,
    });
    await settle();
    expect(announced.length).toBe(before + 1);
});

// Announcements are emitted after the mutation commits, inside the same request.
function settle() {
    return Bun.sleep(50);
}
