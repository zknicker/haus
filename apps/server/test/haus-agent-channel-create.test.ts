import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

const fixture = agentCreationFixture();

/** `haus channel create`: any active Agent opens a channel, as any member may. */
async function createChannel(runner: { token: string }, body: unknown) {
    return await fixture.post('/api/agent/channels/create', runner, body);
}

async function countChannels(name: string) {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as count from chats
        where server_id = ${fixture.serverId} and kind = 'channel' and name = ${name}
    `) as { count: number }[];
    return row?.count ?? 0;
}

test('an Agent creates a channel it joins, and the named human sees it in the App', async () => {
    const runner = await fixture.mintRunner('run_channel_create');
    const realtime = captureAllTopics();

    const created = await createChannel(runner, {
        description: 'Sentry and uptime alerts',
        humans: ['@ada'],
        name: 'alerts',
    });

    expect(created.status).toBe(200);
    expect(created.body as unknown).toEqual({
        description: 'Sentry and uptime alerts',
        humans: ['ada'],
        target: '#alerts',
    });

    // The human sees it in the sidebar list, with the creating Agent as its member.
    const chats = await fixture.owner.trpc.chat.list.query({ serverId: fixture.serverId });
    const channel = chats.find((chat) => chat.name === 'alerts');
    expect(channel).toMatchObject({
        description: 'Sentry and uptime alerts',
        kind: 'channel',
        participantAgentIds: [fixture.orbitAgentId],
        participantUserIds: [fixture.ownerUserId],
    });

    // The App learns of it the way it learns of a channel a human created.
    const published = await publishedSince(realtime, fixture.serverId);
    realtime.stop();
    expect(published).toEqual([
        {
            action: 'created',
            chatId: channel?.id ?? '',
            serverId: fixture.serverId,
            type: 'chat.lifecycle',
        },
    ]);

    // The creator can post there at once: it is a member, not a bystander.
    const members = await fetch(
        new URL('/api/agent/channels/members?target=%23alerts', fixture.harness.url),
        { headers: { authorization: `Bearer ${runner.token}` } }
    );
    expect(members.status).toBe(200);
});

test('a taken name is refused and creates nothing', async () => {
    const runner = await fixture.mintRunner('run_channel_create_taken');

    const taken = await createChannel(runner, { humans: ['ada'], name: 'product' });

    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('CHANNEL_NAME_TAKEN');
    expect(taken.body.nextAction).toContain('haus server info --channels --query product');
    expect(await countChannels('product')).toBe(1);
});

test('a human who is not on this Server is an invalid target and creates nothing', async () => {
    const runner = await fixture.mintRunner('run_channel_create_stranger');

    const stranger = await createChannel(runner, { humans: ['@ada', '@cass'], name: 'ops' });

    expect(stranger.status).toBe(404);
    expect(stranger.body.code).toBe('INVALID_TARGET');
    expect(await countChannels('ops')).toBe(0);
});

test('a channel with no human or an unusable name is refused', async () => {
    const runner = await fixture.mintRunner('run_channel_create_invalid');

    const nobody = await createChannel(runner, { humans: [], name: 'ops' });
    expect(nobody.status).toBe(400);
    expect(nobody.body.code).toBe('INVALID_ARG');

    const spaced = await createChannel(runner, { humans: ['ada'], name: 'ops feed' });
    expect(spaced.status).toBe(400);
    expect(spaced.body.code).toBe('INVALID_ARG');
    expect(await countChannels('ops')).toBe(0);
});

test('the route needs a runner credential', async () => {
    const anonymous = await createChannel({ token: '' }, { humans: ['ada'], name: 'ops' });

    expect(anonymous.status).toBe(400);
    expect(await countChannels('ops')).toBe(0);
});
