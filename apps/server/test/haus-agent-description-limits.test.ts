import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const tooLong = 'x'.repeat(281);

test('every description write path refuses more than 280 characters', async () => {
    const { computerId, orbitAgentId: agentId, owner, serverId } = fixture;
    await expect(
        owner.trpc.agent.create.mutate({
            computerId,
            description: tooLong,
            displayName: 'Longwind',
            handle: 'longwind',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).rejects.toThrow(/280 characters/u);
    await expect(
        owner.trpc.agent.updateProfile.mutate({
            agentId,
            description: tooLong,
            displayName: 'Orbit',
            serverId,
        })
    ).rejects.toThrow(/280 characters/u);

    const runner = await fixture.mintRunner('run_description_limits');
    for (const [path, body] of [
        ['/api/agent/profile/update', { description: tooLong }],
        ['/api/agent/agents/update', { agent: '@peer', description: tooLong }],
        ['/api/agent/agents', fixture.createBody({ description: tooLong, nonce: 'too-long' })],
    ] as const) {
        const refused = await fixture.post(path, runner, body);
        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({
            code: 'INVALID_ARG',
            message: expect.stringContaining('limited to 280 characters'),
        });
    }
    // Exactly at the limit still lands.
    const atLimit = await fixture.post('/api/agent/profile/update', runner, {
        description: 'y'.repeat(280),
    });
    expect(atLimit.status).toBe(200);
});

// iOS resends the stored description on every save, so a description written before the
// 280-character cap must survive an unchanged resend on every update path.
test('an unchanged legacy description passes every update path; a changed long one does not', async () => {
    const { orbitAgentId: agentId, owner, peerAgentId, serverId } = fixture;
    const legacy = 'z'.repeat(450);
    await fixture.harness.sql`
        UPDATE agents SET description = ${legacy} WHERE id IN (${agentId}, ${peerAgentId})
    `;

    const saved = await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: legacy,
        displayName: 'Orbit Renamed',
        serverId,
    });
    expect(saved).toMatchObject({ description: legacy, displayName: 'Orbit Renamed' });
    await expect(
        owner.trpc.agent.updateProfile.mutate({
            agentId,
            description: `${legacy}!`,
            displayName: 'Orbit',
            serverId,
        })
    ).rejects.toThrow(/280 characters/u);

    const runner = await fixture.mintRunner('run_legacy_description');
    for (const [path, body] of [
        ['/api/agent/profile/update', { description: legacy }],
        ['/api/agent/agents/update', { agent: '@peer', description: legacy }],
    ] as const) {
        expect((await fixture.post(path, runner, body)).status).toBe(200);
    }
    for (const [path, body] of [
        ['/api/agent/profile/update', { description: `${legacy}!` }],
        ['/api/agent/agents/update', { agent: '@peer', description: `${legacy}!` }],
    ] as const) {
        const refused = await fixture.post(path, runner, body);
        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({
            code: 'INVALID_ARG',
            message: expect.stringContaining('limited to 280 characters'),
        });
    }

    await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        serverId,
    });
    await owner.trpc.agent.updateProfile.mutate({
        agentId: peerAgentId,
        description: 'Reviews the delivery lane.',
        displayName: 'Peer',
        serverId,
    });
});
