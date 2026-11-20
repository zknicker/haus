import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';
import { createTestProject } from './project.fixture.ts';

const fixture = agentCreationFixture();

let member: HausClient;
let memberUserId = '';
let memberDmChatId = '';
let scoutingChannelId = '';

beforeAll(async () => {
    member = await fixture.signIn('user_agent_creation_member', ['bree@haus.test']);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'bree@haus.test',
        serverId: fixture.serverId,
    });
    await member.trpc.invitation.accept.mutate({ token });
    await member.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Bree',
        handle: 'bree',
        serverId: fixture.serverId,
    });
    memberUserId = await fixture.readUserId('user_agent_creation_member');
    memberDmChatId = (
        await member.trpc.chat.ensureAgentDm.mutate({
            agentId: fixture.orbitAgentId,
            serverId: fixture.serverId,
        })
    ).id;
    scoutingChannelId = (
        await createTestProject(fixture.harness, fixture.owner, {
            agentIds: [fixture.peerAgentId],
            name: 'scouting',
            serverId: fixture.serverId,
        })
    ).id;
});

afterAll(() => {
    member?.close();
});

test('an Agent created inside a DM owns its DM with that human', async () => {
    const runner = await fixture.mintRunner('run_dm_owner', fixture.orbitAgentId, memberDmChatId);

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Ferry',
            nonce: 'create-dm-owner',
            target: 'dm:@bree',
        })
    );

    expect(created.status).toBe(200);
    expect(created.body.chatId).toBe(memberDmChatId);
    const dms = await readAgentDms(created.body.agent?.agentId ?? '');
    // The requesting human owns the DM, not the Server Owner who owns this Server.
    expect(dms).toHaveLength(1);
    expect(dms[0].dm_member_one_user_id).toBe(memberUserId);
    // The record alone carries no message: the DM becomes a Chat on its first one.
    expect(dms[0].last_message_sequence).toBe(0);
});

test('an Agent created in a channel owns its DM with the Server Owner', async () => {
    const runner = await fixture.mintRunner(
        'run_channel_owner',
        fixture.peerAgentId,
        scoutingChannelId
    );

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Pilot',
            nonce: 'create-channel-owner',
            target: '#scouting',
        })
    );

    expect(created.status).toBe(200);
    const dms = await readAgentDms(created.body.agent?.agentId ?? '');
    expect(dms).toHaveLength(1);
    expect(dms[0].dm_member_one_user_id).toBe(fixture.ownerUserId);
});

// A DM is human ↔ Agent (ADR 0028). The peer-Agent resolver is gone, so an
// Agent handle in a DM target is simply an unknown target.
test('a send to another Agent’s handle is an invalid target', async () => {
    const runner = await fixture.mintRunner(
        'run_peer_dm_refused',
        fixture.peerAgentId,
        scoutingChannelId
    );

    const sent = await sendBrief(runner, 'dm:@orbit', 'peer-dm-refused');

    expect(sent.status).toBe(404);
    expect(sent.body.code).toBe('INVALID_TARGET');
    // Nothing was materialized for the peer: Orbit still has only its human DM.
    const orbitDms = await readAgentDms(fixture.orbitAgentId);
    expect(orbitDms.map((dm) => dm.id)).toEqual([memberDmChatId]);
});

test('a message-suffixed target under another Agent’s handle is invalid too', async () => {
    const runner = await fixture.mintRunner(
        'run_peer_dm_suffix_refused',
        fixture.peerAgentId,
        scoutingChannelId
    );

    const sent = await sendBrief(runner, 'dm:@orbit:00000000', 'peer-dm-suffix-refused');

    expect(sent.status).toBe(404);
    expect(sent.body.code).toBe('INVALID_TARGET');
});

/** `haus message send`: the receipt names the Chat the message actually landed in. */
async function sendBrief(runner: { token: string }, target: string, nonce: string) {
    const response = await fetch(new URL('/api/agent/messages/send', fixture.harness.url), {
        body: JSON.stringify({ content: 'Here is your working brief.', nonce, target }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as {
            code?: string;
            message?: { chat_id?: string };
            state?: string;
        },
        status: response.status,
    };
}

async function readAgentDms(agentId: string) {
    return (await fixture.harness.sql`
        select id, dm_member_one_user_id, last_message_sequence
        from chats
        where server_id = ${fixture.serverId} and kind = 'dm' and dm_agent_id = ${agentId}
    `) as { dm_member_one_user_id: string; id: string; last_message_sequence: number }[];
}
