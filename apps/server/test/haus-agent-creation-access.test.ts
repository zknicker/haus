import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('any active managed Agent of the Server may create an Agent', async () => {
    const lane = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [fixture.peerAgentId],
        name: 'peer-lane',
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner('run_access_peer', fixture.peerAgentId, lane.id);

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Peerling',
            nonce: 'access-peer',
            target: '#peer-lane',
        })
    );

    expect(created.status).toBe(200);
    expect(await fixture.readAgentRow(created.body.agent?.agentId ?? '')).toMatchObject({
        created_by_agent_id: fixture.peerAgentId,
    });
});

test('a request with no runner credential is refused', async () => {
    const refused = await fixture.postCreate(
        null,
        fixture.createBody({ displayName: 'Anonymous', nonce: 'access-anonymous' })
    );

    expect(refused.status).toBe(401);
    expect(refused.body).toMatchObject({ code: 'MISSING_TOKEN' });
});

test('a retired credential can neither create nor update', async () => {
    const doomedAgentId = await fixture.createAgent('Doomed', 'doomed');
    const lane = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [doomedAgentId],
        name: 'doomed-lane',
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner('run_access_retired', doomedAgentId, lane.id);
    await fixture.owner.trpc.agent.delete.mutate({
        agentId: doomedAgentId,
        confirmation: 'Doomed',
        serverId: fixture.serverId,
    });

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Ghost',
            nonce: 'access-retired',
            target: '#doomed-lane',
        })
    );
    expect(created.status).toBe(401);

    const updated = await fixture.post('/api/agent/agents/update', runner, {
        agent: '@peer',
        description: 'Rewritten by a ghost.',
    });
    expect(updated.status).toBe(401);
});

test('an Agent cannot reach an Agent on another Server', async () => {
    await fixture.seedOffsiteAgent('offsite');
    const runner = await fixture.mintRunner('run_access_isolation');

    const refused = await fixture.post('/api/agent/agents/update', runner, {
        agent: '@offsite',
        description: 'Reaching across Servers.',
    });

    expect(refused.status).toBe(404);
    expect(refused.body).toMatchObject({ code: 'AGENT_NOT_FOUND' });
});

test('updating another Agent rewrites only its description', async () => {
    const runner = await fixture.mintRunner('run_access_update');

    const updated = await fixture.post('/api/agent/agents/update', runner, {
        agent: '@peer',
        description: 'Now watches the release lane.',
    });

    expect(updated.status).toBe(200);
    expect(updated.body.agent).toMatchObject({
        agentId: fixture.peerAgentId,
        description: 'Now watches the release lane.',
        displayName: 'Peer',
        handle: 'peer',
        retired: false,
    });
    expect(await fixture.readAgentRow(fixture.peerAgentId)).toMatchObject({
        description: 'Now watches the release lane.',
        handle: 'peer',
    });
});

test("Cove's product-owned identity refuses both update and avatar", async () => {
    const runner = await fixture.mintRunner('run_access_cove');

    const updated = await fixture.post('/api/agent/agents/update', runner, {
        agent: '@cove',
        description: 'Rewriting the onboarding guide.',
    });
    expect(updated.status).toBe(403);
    expect(updated.body).toMatchObject({ code: 'AGENT_IDENTITY_PROTECTED' });

    const avatar = await fixture.post('/api/agent/agents/avatar', runner, {
        agent: '@cove',
        concept: 'a tidal pool',
    });
    expect(avatar.status).toBe(403);
    expect(avatar.body).toMatchObject({ code: 'AGENT_IDENTITY_PROTECTED' });
    expect(await fixture.readAgentRow(fixture.coveAgentId)).toMatchObject({
        avatar_id: null,
        description: 'Onboarding Assistant',
    });
});
