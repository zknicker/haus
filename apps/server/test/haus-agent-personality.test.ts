import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
const personality = 'Terse. Plain words. Dry humor.';
const tooLong = 'x'.repeat(281);

let member: HausClient;

beforeAll(async () => {
    member = await fixture.signIn('user_personality_member', ['dee@haus.test']);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'dee@haus.test',
        serverId: fixture.serverId,
    });
    await member.trpc.invitation.accept.mutate({ token });
});

test('an Owner sets, keeps, and clears a personality the member-wide record never carries', async () => {
    const { owner, orbitAgentId: agentId, serverId } = fixture;
    const updated = await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        personality: `  ${personality}  `,
        serverId,
    });
    expect(JSON.stringify(updated)).not.toContain(personality);
    expect(await owner.trpc.agent.personality.query({ agentId, serverId })).toEqual({
        personality,
    });
    const listed = await owner.trpc.agent.list.query({ serverId });
    expect(JSON.stringify(listed)).not.toContain(personality);

    // A client that does not edit the personality leaves it alone.
    await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        serverId,
    });
    expect((await owner.trpc.agent.personality.query({ agentId, serverId })).personality).toBe(
        personality
    );

    await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        personality: '   ',
        serverId,
    });
    expect((await owner.trpc.agent.personality.query({ agentId, serverId })).personality).toBe(
        null
    );
});

test('a Member can neither read nor write a personality, and Cove refuses one', async () => {
    const { coveAgentId, orbitAgentId: agentId, owner, serverId } = fixture;
    await expect(member.trpc.agent.personality.query({ agentId, serverId })).rejects.toThrow(
        /Owner or Admin/u
    );
    await expect(
        member.trpc.agent.updateProfile.mutate({
            agentId,
            description: null,
            displayName: 'Orbit',
            personality,
            serverId,
        })
    ).rejects.toThrow(/Owner or Admin/u);
    await expect(
        owner.trpc.agent.updateProfile.mutate({
            agentId: coveAgentId,
            description: 'Onboarding Assistant',
            displayName: 'Cove',
            personality,
            serverId,
        })
    ).rejects.toThrow(/product-owned identity/u);
    await expect(
        owner.trpc.agent.updateProfile.mutate({
            agentId,
            description: null,
            displayName: 'Orbit',
            personality: 'x'.repeat(2001),
            serverId,
        })
    ).rejects.toThrow(/2000 characters/u);
});

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

    const runner = await fixture.mintRunner('run_personality_limits');
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

test('no Agent API reads or writes a personality', async () => {
    const { orbitAgentId: agentId, owner, serverId } = fixture;
    await owner.trpc.agent.updateProfile.mutate({
        agentId: fixture.peerAgentId,
        description: 'Reviews the delivery lane.',
        displayName: 'Peer',
        personality,
        serverId,
    });
    await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        personality,
        serverId,
    });
    const runner = await fixture.mintRunner('run_personality_private');

    const write = await fixture.post('/api/agent/profile/update', runner, {
        description: 'Keeps release notes current.',
        personality: 'Loud.',
    });
    expect(write.status).toBe(400);
    expect((await owner.trpc.agent.personality.query({ agentId, serverId })).personality).toBe(
        personality
    );

    for (const [path, query] of [
        ['/api/agent/profile', {}],
        ['/api/agent/profile', { target: '@peer' }],
        ['/api/agent/server', { agents: 'true', channels: 'true', humans: 'true' }],
        ['/api/agent/channels/info', { target: '#product' }],
        ['/api/agent/channels/members', { target: '#product' }],
    ] as const) {
        const url = new URL(path, fixture.harness.url);
        for (const [name, value] of Object.entries(query)) {
            url.searchParams.set(name, value);
        }
        const response = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
        expect(response.status).toBe(200);
        expect(await response.text()).not.toContain(personality);
    }
});
