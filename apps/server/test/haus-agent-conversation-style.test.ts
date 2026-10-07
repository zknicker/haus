import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
const conversationStyle = 'Terse. Plain words. Dry humor.';

let member: HausClient;

beforeAll(async () => {
    member = await fixture.signIn('user_style_member', ['dee@haus.test']);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'dee@haus.test',
        serverId: fixture.serverId,
    });
    await member.trpc.invitation.accept.mutate({ token });
});

test('an Owner sets, keeps, and clears a conversation style the member-wide record never carries', async () => {
    const { owner, orbitAgentId: agentId, serverId } = fixture;
    const read = () => owner.trpc.agent.conversationStyle.query({ agentId, serverId });
    expect(
        await owner.trpc.agent.updateConversationStyle.mutate({
            agentId,
            conversationStyle: `  ${conversationStyle}  `,
            serverId,
            signatureEmoji: '❤',
        })
    ).toEqual({ conversationStyle, signatureEmoji: '❤️' });
    expect(await read()).toEqual({ conversationStyle, signatureEmoji: '❤️' });
    const listed = await owner.trpc.agent.list.query({ serverId });
    expect(JSON.stringify(listed)).not.toContain(conversationStyle);

    // A profile save and an emoji-only write leave the style alone.
    await owner.trpc.agent.updateProfile.mutate({
        agentId,
        description: 'Keeps release notes current.',
        displayName: 'Orbit',
        serverId,
    });
    await owner.trpc.agent.updateConversationStyle.mutate({
        agentId,
        serverId,
        signatureEmoji: '🦊',
    });
    expect(await read()).toEqual({ conversationStyle, signatureEmoji: '🦊' });

    await owner.trpc.agent.updateConversationStyle.mutate({
        agentId,
        conversationStyle: '   ',
        serverId,
        signatureEmoji: null,
    });
    expect(await read()).toEqual({ conversationStyle: null, signatureEmoji: null });
});

test('a Member can neither read nor write a conversation style; Cove takes only an emoji', async () => {
    const { coveAgentId, orbitAgentId: agentId, owner, serverId } = fixture;
    await expect(member.trpc.agent.conversationStyle.query({ agentId, serverId })).rejects.toThrow(
        /Owner or Admin/u
    );
    await expect(
        member.trpc.agent.updateConversationStyle.mutate({ agentId, conversationStyle, serverId })
    ).rejects.toThrow(/Owner or Admin/u);
    await expect(
        owner.trpc.agent.updateConversationStyle.mutate({
            agentId: coveAgentId,
            conversationStyle,
            serverId,
        })
    ).rejects.toThrow(/product-owned identity/u);
    expect(
        await owner.trpc.agent.updateConversationStyle.mutate({
            agentId: coveAgentId,
            serverId,
            signatureEmoji: '🌊',
        })
    ).toEqual({ conversationStyle: null, signatureEmoji: '🌊' });
    await expect(
        owner.trpc.agent.updateConversationStyle.mutate({
            agentId,
            conversationStyle: 'x'.repeat(2001),
            serverId,
        })
    ).rejects.toThrow(/2000 characters/u);
    await expect(
        owner.trpc.agent.updateConversationStyle.mutate({ agentId, serverId, signatureEmoji: 'ok' })
    ).rejects.toThrow(/exactly one emoji/u);
});

test('an Agent reads and tunes its own conversation style and emoji, and only its own', async () => {
    const { orbitAgentId: agentId, owner, peerAgentId, serverId } = fixture;
    await owner.trpc.agent.updateConversationStyle.mutate({
        agentId: peerAgentId,
        conversationStyle: 'Peer secret style.',
        serverId,
    });
    const runner = await fixture.mintRunner('run_style_self');

    const tuned = await fixture.post('/api/agent/profile/update', runner, {
        conversationStyle: 'Pirate asides, sparingly.',
        signatureEmoji: '🏴‍☠️',
    });
    expect(tuned.status).toBe(200);
    expect(tuned.body).toMatchObject({
        profile: {
            conversationStyle: 'Pirate asides, sparingly.',
            handle: 'orbit',
            isSelf: true,
            signatureEmoji: '🏴‍☠️',
        },
    });
    expect(await owner.trpc.agent.conversationStyle.query({ agentId, serverId })).toEqual({
        conversationStyle: 'Pirate asides, sparingly.',
        signatureEmoji: '🏴‍☠️',
    });

    const self = await readProfile(runner);
    expect(self).toMatchObject({
        profile: { conversationStyle: 'Pirate asides, sparingly.', signatureEmoji: '🏴‍☠️' },
    });
    const peer = await readProfile(runner, '@peer');
    expect(peer.profile).not.toHaveProperty('conversationStyle');
    expect(JSON.stringify(peer)).not.toContain('Peer secret style.');

    // No target exists on the self route, so naming another Agent is refused outright.
    const aimed = await fixture.post('/api/agent/profile/update', runner, {
        agent: '@peer',
        conversationStyle: 'Hijacked.',
    });
    expect(aimed.status).toBe(400);
    expect(
        (await owner.trpc.agent.conversationStyle.query({ agentId: peerAgentId, serverId }))
            .conversationStyle
    ).toBe('Peer secret style.');

    const badEmoji = await fixture.post('/api/agent/profile/update', runner, {
        signatureEmoji: '🦊🦊',
    });
    expect(badEmoji.status).toBe(400);
    expect(badEmoji.body.message).toContain('exactly one emoji');
    expect((await fixture.post('/api/agent/profile/update', runner, {})).status).toBe(400);

    const cleared = await fixture.post('/api/agent/profile/update', runner, {
        conversationStyle: null,
        signatureEmoji: null,
    });
    expect(cleared.body).toMatchObject({
        profile: { conversationStyle: null, signatureEmoji: null },
    });
});

test('a refused field leaves the whole self-update unwritten', async () => {
    const { coveAgentId, owner, serverId } = fixture;
    const before = await owner.trpc.agent.conversationStyle.query({
        agentId: coveAgentId,
        serverId,
    });
    const description = (await fixture.readAgentRow(coveAgentId))?.description;
    const runner = await fixture.mintRunner('run_style_cove_atomic', coveAgentId);

    const refused = await fixture.post('/api/agent/profile/update', runner, {
        conversationStyle,
        description: 'Rewritten in the same request.',
        signatureEmoji: '🐚',
    });
    expect(refused.status).toBe(403);
    expect(
        await owner.trpc.agent.conversationStyle.query({ agentId: coveAgentId, serverId })
    ).toEqual(before);
    expect((await fixture.readAgentRow(coveAgentId))?.description).toBe(description);
});

test('no other Agent API surface reads a conversation style', async () => {
    const { owner, peerAgentId: agentId, serverId } = fixture;
    await owner.trpc.agent.updateConversationStyle.mutate({ agentId, conversationStyle, serverId });
    const runner = await fixture.mintRunner('run_style_private');
    for (const [path, query] of [
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
        expect(await response.text()).not.toContain(conversationStyle);
    }
});

async function readProfile(runner: { token: string }, target?: string) {
    const url = new URL('/api/agent/profile', fixture.harness.url);
    if (target) {
        url.searchParams.set('target', target);
    }
    const response = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    expect(response.status).toBe(200);
    return (await response.json()) as { profile: Record<string, unknown> };
}
