import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('the App captures a device zone once and the human owns it afterwards', async () => {
    const { owner, ownerUserId, serverId } = fixture;
    const viewerZone = async () =>
        (await owner.trpc.member.get.query({ serverId, userId: ownerUserId })).timezone;

    expect(await viewerZone()).toBeNull();
    await owner.trpc.member.syncIdentity.mutate({
        email: 'ada@haus.test',
        name: 'Ada',
        serverId,
        timezone: 'America/New_York',
    });
    expect(await viewerZone()).toBe('America/New_York');

    // A later sign-in from another device fills only a blank.
    await owner.trpc.member.syncIdentity.mutate({
        email: 'ada@haus.test',
        name: 'Ada',
        serverId,
        timezone: 'Asia/Tokyo',
    });
    expect(await viewerZone()).toBe('America/New_York');

    await owner.trpc.member.setTimezone.mutate({ serverId, timezone: 'Europe/Berlin' });
    expect(await viewerZone()).toBe('Europe/Berlin');
    const directory = await owner.trpc.member.list.query({ serverId });
    expect(directory.members.find((member) => member.userId === ownerUserId)?.timezone).toBe(
        'Europe/Berlin'
    );
});

test('a timezone must be an IANA zone and only a member sets their own', async () => {
    const { otherServerId, outsider, owner, serverId } = fixture;
    await expect(
        owner.trpc.member.setTimezone.mutate({ serverId, timezone: 'Eastern' })
    ).rejects.toThrow('IANA timezone');
    await expect(
        owner.trpc.member.setTimezone.mutate({ serverId, timezone: '+05:00' })
    ).rejects.toThrow('IANA timezone');
    await expect(
        outsider.trpc.member.setTimezone.mutate({ serverId, timezone: 'Asia/Tokyo' })
    ).rejects.toThrow();
    await owner.trpc.member.setTimezone.mutate({ serverId, timezone: 'europe/berlin' });
    expect(
        (await owner.trpc.member.get.query({ serverId, userId: fixture.ownerUserId })).timezone
    ).toBe('Europe/Berlin');
    await outsider.trpc.member.setTimezone.mutate({
        serverId: otherServerId,
        timezone: 'Asia/Tokyo',
    });
});

// A sign-in sync that read a blank zone must not overwrite a zone the human
// set while it ran: the fill checks for a blank in the same statement.
test('a device-zone fill never overwrites a concurrently chosen zone', async () => {
    const { owner, ownerUserId, serverId } = fixture;
    for (let round = 0; round < 8; round += 1) {
        await fixture.harness.sql`update users set timezone = null where id = ${ownerUserId}`;
        await Promise.all([
            owner.trpc.member.syncIdentity.mutate({
                email: 'ada@haus.test',
                name: 'Ada',
                serverId,
                timezone: 'Asia/Tokyo',
            }),
            owner.trpc.member.setTimezone.mutate({ serverId, timezone: 'Europe/Berlin' }),
        ]);
        expect(
            (await owner.trpc.member.get.query({ serverId, userId: ownerUserId })).timezone
        ).toBe('Europe/Berlin');
    }
});

test('people lookup shows each human’s timezone to Agents', async () => {
    const { owner, serverId } = fixture;
    await owner.trpc.member.setTimezone.mutate({ serverId, timezone: 'America/Chicago' });
    const runner = await fixture.mintRunner('run_human_timezone');

    const directory = await agentGet('/api/agent/server?humans=true', runner);
    expect(directory.status).toBe(200);
    expect(directory.body.humans).toContainEqual(
        expect.objectContaining({ handle: 'ada', timezone: 'America/Chicago' })
    );

    const members = await agentGet(
        `/api/agent/channels/members?target=${encodeURIComponent('#product')}`,
        runner
    );
    expect(members.status).toBe(200);
    expect(members.body.members).toContainEqual(
        expect.objectContaining({ handle: 'ada', role: 'human', timezone: 'America/Chicago' })
    );
    expect(members.body.members).not.toContainEqual(
        expect.objectContaining({ role: 'agent', timezone: expect.anything() })
    );
});

async function agentGet(path: string, runner: { token: string }) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return {
        body: (await response.json()) as { humans?: unknown[]; members?: unknown[] },
        status: response.status,
    };
}
