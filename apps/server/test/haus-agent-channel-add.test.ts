import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { captureAllTopics, settleRealtime } from './realtime-capture.ts';

const fixture = agentCreationFixture();

/** `haus channel add`: any active Agent may put any active Agent in a channel. */
async function addToChannel(runner: { token: string }, body: unknown) {
    return await fixture.post('/api/agent/channels/add', runner, body);
}

async function readChannelAgentHandles(chatId: string) {
    const rows = (await fixture.harness.sql`
        select a.handle
        from channel_agent_participants p
        join agents a on a.server_id = p.server_id and a.id = p.agent_id
        where p.server_id = ${fixture.serverId} and p.chat_id = ${chatId}
        order by a.handle
    `) as { handle: string }[];
    return rows.map((row) => row.handle);
}

test('one Agent adds another to a channel, and repeating it changes nothing', async () => {
    const runner = await fixture.mintRunner('run_channel_add');
    const realtime = captureAllTopics();

    const added = await addToChannel(runner, { agent: '@peer', target: '#product' });

    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ added: true, handle: 'peer', target: '#product' });
    expect(await readChannelAgentHandles(fixture.channelId)).toContain('peer');

    // Membership is what the App reads off a channel, so the add announces itself.
    await settleRealtime();
    expect(realtime.topics()).toEqual(['chat.lifecycle']);
    realtime.stop();

    const again = await addToChannel(runner, { agent: 'peer', target: '#product' });

    expect(again.status).toBe(200);
    expect(again.body.added).toBe(false);
    expect(
        (await readChannelAgentHandles(fixture.channelId)).filter((handle) => handle === 'peer')
    ).toHaveLength(1);
});

test('an unknown channel or Agent is an invalid target and changes nothing', async () => {
    const runner = await fixture.mintRunner('run_channel_add_unknown');

    const noChannel = await addToChannel(runner, { agent: '@peer', target: '#nowhere' });
    expect(noChannel.status).toBe(404);
    expect(noChannel.body.code).toBe('INVALID_TARGET');

    const noAgent = await addToChannel(runner, { agent: '@nobody', target: '#product' });
    expect(noAgent.status).toBe(404);
    expect(noAgent.body.code).toBe('INVALID_TARGET');
    expect(await readChannelAgentHandles(fixture.channelId)).not.toContain('nobody');
});

test('Cove’s channel membership stays product-owned', async () => {
    const runner = await fixture.mintRunner('run_channel_add_cove');

    const refused = await addToChannel(runner, { agent: '@cove', target: '#product' });

    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('AGENT_IDENTITY_PROTECTED');
    expect(await readChannelAgentHandles(fixture.channelId)).not.toContain('cove');
});

test('the route needs a runner credential', async () => {
    const anonymous = await addToChannel({ token: '' }, { agent: '@peer', target: '#product' });

    expect(anonymous.status).toBe(400);
});
