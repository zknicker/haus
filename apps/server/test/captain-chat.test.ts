import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { testSqlAgentHome } from './agent-home.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import type { HausClient } from './haus-client.ts';
import { createTestProject } from './project.fixture.ts';

const fixture = agentCreationFixture();

let member: HausClient;
let memberUserId = '';
let orbitChatId = '';
let scoutingChannelId = '';

beforeAll(async () => {
    member = await fixture.signIn('user_captain_chat_member', ['bree@haus.test']);
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
    memberUserId = await fixture.readUserId('user_captain_chat_member');
    orbitChatId = (
        await openCaptainChat(member, { agentId: fixture.orbitAgentId, serverId: fixture.serverId })
    ).id;
    scoutingChannelId = (
        await createTestProject(fixture.owner, {
            agentIds: [fixture.peerAgentId],
            name: 'scouting',
            serverId: fixture.serverId,
        })
    ).id;
});

afterAll(() => {
    member?.close();
});

test('every member sees a Captain chat; only its owner starts as a subscribed member', async () => {
    const forOwner = await openCaptainChat(fixture.owner, {
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    const forMember = await openCaptainChat(member, {
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    expect(forOwner).toMatchObject({ captainChat: { member: true, subscribed: true } });
    expect(forMember).toMatchObject({
        captainChat: { member: false, subscribed: false },
        id: forOwner.id,
        unreadCount: 0,
    });
});

test('the Captain chat reaches its Captain on a cold start and no other Captain', async () => {
    const sent = await member.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: 'Can you and @peer look at the deploy?',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
        targetKind: 'captain',
    });
    expect(sent.message.chatId).toBe(orbitChatId);
    expect(
        await fixture.harness.sql`
            select agent_id, addressed_reason from agent_inbox
            where dedupe_key = ${sent.message.id}
        `
    ).toEqual([{ addressed_reason: 'captain_chat', agent_id: fixture.orbitAgentId }]);
    const joined = await openCaptainChat(member, {
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    expect(joined.captainChat).toEqual({ member: true, subscribed: true });
});

test('unread follows the subscription, and leaving clears it', async () => {
    await fixture.owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: 'One more thing.',
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
        targetKind: 'captain',
    });
    const before = await openCaptainChat(member, {
        agentId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });
    expect(before.unreadCount).toBeGreaterThan(0);
    const unsubscribed = await member.trpc.chat.setCaptainChatMembership.mutate({
        chatId: orbitChatId,
        serverId: fixture.serverId,
        subscribed: false,
    });
    expect(unsubscribed).toMatchObject({
        captainChat: { member: true, subscribed: false },
        unreadCount: 0,
    });
    const left = await member.trpc.chat.setCaptainChatMembership.mutate({
        chatId: orbitChatId,
        member: false,
        serverId: fixture.serverId,
    });
    expect(left.captainChat).toEqual({ member: false, subscribed: false });
});

test('only the Captain posts in its chat; another agent gets INVALID_TARGET', async () => {
    const peer = await fixture.mintRunner(
        'run_captain_chat_peer',
        fixture.peerAgentId,
        scoutingChannelId
    );
    const refused = await sendAs(peer, 'captain:@orbit', 'captain-chat-peer');
    expect(refused).toMatchObject({ body: { code: 'INVALID_TARGET' }, status: 404 });
    expect(await sendAs(peer, 'dm:@bree', 'captain-chat-dm')).toMatchObject({
        body: { code: 'INVALID_TARGET' },
        status: 404,
    });
    const orbit = await fixture.mintRunner(
        'run_captain_chat_orbit',
        fixture.orbitAgentId,
        orbitChatId
    );
    const own = await sendAs(orbit, 'captain:@orbit', 'captain-chat-own');
    expect(own.status).toBe(200);
});

test('a Captain another Captain creates takes its creator’s owner and gets its own chat', async () => {
    const runner = await fixture.mintRunner(
        'run_captain_chat_create',
        fixture.peerAgentId,
        scoutingChannelId
    );
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Ferry',
            nonce: 'captain-chat-create',
            target: '#scouting',
        })
    );
    expect(created.status).toBe(200);
    const agentId = created.body.agent?.agentId ?? '';
    expect(
        await fixture.harness.sql`
            select owner_user_id from agents where id = ${agentId}
        `
    ).toEqual([{ owner_user_id: fixture.ownerUserId }]);
    const chats = (await fixture.harness.sql`
        select chat.id, member.user_id
        from chats chat
        join captain_chat_members member on member.chat_id = chat.id
        where chat.kind = 'captain' and chat.captain_agent_id = ${agentId}
    `) as { id: string; user_id: string }[];
    expect(chats.map((chat) => chat.user_id)).toEqual([fixture.ownerUserId]);
    expect(memberUserId).not.toBe(fixture.ownerUserId);
});

test('a Captain row written by SQL alone gets its Captain chat, read, and owner', async () => {
    const agentId = createOpaqueId('agt');
    await fixture.harness.sql`
        insert into agents (
            id, server_id, computer_id, display_name, handle, home_timezone,
            desired_model_id, desired_runtime_id, home_project_id, owner_user_id)
        values (
            ${agentId}, ${fixture.serverId}, ${fixture.computerId}, 'Sloop', 'sloop', 'UTC',
            'gpt-5.6-sol', 'codex', ${await testSqlAgentHome(fixture.harness.sql, fixture.serverId)},
            ${fixture.ownerUserId}
        )
    `;
    const [chat] = (await fixture.harness.sql`
        select chat.id,
            (select count(*)::int from agent_chat_reads read
                where read.chat_id = chat.id and read.agent_id = ${agentId}) as reads,
            array(select member.user_id from captain_chat_members member
                where member.chat_id = chat.id) as members
        from chats chat
        where chat.kind = 'captain' and chat.captain_agent_id = ${agentId}
    `) as { id: string; members: string[]; reads: number }[];
    expect(chat).toMatchObject({ members: [fixture.ownerUserId], reads: 1 });
    expect(chat?.id).toMatch(/^cht_[A-Za-z0-9_-]{16}$/u);
    const opened = await openCaptainChat(fixture.owner, { agentId, serverId: fixture.serverId });
    expect(opened.id).toBe(chat?.id ?? '');
});

async function sendAs(runner: { token: string }, target: string, nonce: string) {
    const response = await fetch(new URL('/api/agent/messages/send', fixture.harness.url), {
        body: JSON.stringify({ content: 'A note.', nonce, target }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as { code?: string }, status: response.status };
}
