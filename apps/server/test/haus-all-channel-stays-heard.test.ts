import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('an Agent cannot leave #all, the team room', async () => {
    const runner = await fixture.mintRunner('run_all_leave');

    const left = await fixture.post('/api/agent/channels/leave', runner, { target: '#all' });

    expect(left.status).toBe(404);
    expect(left.body.message).toBe(
        'Every Agent hears #all, the team room, so you cannot leave it.'
    );
    expect(await isMember(fixture.orbitAgentId)).toBe(true);
});

test('an Agent cannot mute #all, but can still leave and mute a Project', async () => {
    const runner = await fixture.mintRunner('run_all_mute');

    const muted = await fixture.post('/api/agent/channels/mute', runner, { target: '#all' });
    expect(muted.status).toBe(404);
    expect(muted.body.message).toBe(
        'Every Agent hears #all, the team room, so you cannot mute it.'
    );
    expect(
        await fixture.harness.sql`SELECT agent_id FROM agent_channel_mutes
            WHERE agent_id = ${fixture.orbitAgentId}`
    ).toEqual([]);

    const unmuted = await fixture.post('/api/agent/channels/unmute', runner, { target: '#all' });
    expect(unmuted.status).toBe(200);
    const mutedProject = await fixture.post('/api/agent/channels/mute', runner, {
        target: '#product',
    });
    expect(mutedProject.status).toBe(200);
});

async function isMember(agentId: string) {
    const [row] = await fixture.harness.sql`
        SELECT 1 AS member FROM channel_agent_participants participant
        JOIN chats everyone ON everyone.id = participant.chat_id AND everyone.is_all
        WHERE participant.agent_id = ${agentId}`;
    return row !== undefined;
}
