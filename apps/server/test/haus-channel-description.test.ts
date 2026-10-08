import { expect, test } from 'bun:test';
import { allChannelDescription } from '../src/servers/contracts.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

async function agentGet(path: string, runner: { token: string }) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

async function allChannel() {
    const chats = await fixture.owner.trpc.chat.list.query({ serverId: fixture.serverId });
    const all = chats.find((chat) => chat.isAll);
    if (!all) {
        throw new Error('The Server has no #all.');
    }
    return all;
}

test('a new Server seeds #all with its shared description', async () => {
    const all = await allChannel();

    expect(all.description).toBe(allChannelDescription);
    expect(allChannelDescription).toBe(
        'General channel for all members and team-wide announcements.'
    );
});

test('humans set, trim, clear, and keep a channel description', async () => {
    const created = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [fixture.orbitAgentId],
        description: '  Release coordination.  ',
        name: 'releases',
        serverId: fixture.serverId,
    });
    expect(created.description).toBe('Release coordination.');

    const base = {
        agentIds: [fixture.orbitAgentId],
        chatId: created.id,
        name: 'releases',
        serverId: fixture.serverId,
    };
    // Omitting the field leaves the stored description alone.
    const kept = await fixture.owner.trpc.chat.updateChannel.mutate({ ...base, name: 'ship' });
    expect(kept.description).toBe('Release coordination.');

    const cleared = await fixture.owner.trpc.chat.updateChannel.mutate({
        ...base,
        description: '   ',
    });
    expect(cleared.description).toBeNull();

    await expect(
        fixture.owner.trpc.chat.updateChannel.mutate({ ...base, description: 'x'.repeat(501) })
    ).rejects.toThrow();

    const all = await allChannel();
    const allEdited = await fixture.owner.trpc.chat.updateChannel.mutate({
        agentIds:
            all.participantAgentIds.length > 0 ? all.participantAgentIds : [fixture.orbitAgentId],
        chatId: all.id,
        description: allChannelDescription,
        name: 'all',
        serverId: fixture.serverId,
    });
    expect(allEdited.description).toBe(allChannelDescription);
});

test('Agents read channel descriptions with bare handles from server and channel info', async () => {
    const runner = await fixture.mintRunner('run_channel_description');

    const server = await agentGet('/api/agent/server?channels=true', runner);
    expect(server.status).toBe(200);
    const channels = server.body.channels as { description: string | null; handle: string }[];
    expect(channels).toContainEqual(
        expect.objectContaining({ description: allChannelDescription, handle: 'all' })
    );
    expect(channels).toContainEqual(
        expect.objectContaining({ description: null, handle: 'product' })
    );

    const info = await agentGet(
        `/api/agent/channels/info?target=${encodeURIComponent('#all')}`,
        runner
    );
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ description: allChannelDescription, handle: 'all' });
});
