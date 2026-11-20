import { beforeAll, expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let opsId: string;

beforeAll(async () => {
    const { owner, serverId } = fixture;
    opsId = (await owner.trpc.project.create.mutate({ key: 'OPS', name: 'ops', serverId })).chat.id;
});

async function agentCall(runner: { token: string }, path: string, body?: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: body === undefined ? 'GET' : 'POST',
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

function humanSend(chatId: string, content: string) {
    return fixture.owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
}

async function inboxAgentsFor(messageId: string) {
    const rows = (await fixture.harness.sql`
        select agent_id from agent_inbox where dedupe_key = ${messageId} order by agent_id
    `) as { agent_id: string }[];
    return rows.map((row) => row.agent_id);
}

async function historyContents(runner: { token: string }, target: string) {
    const read = await agentCall(runner, `/api/agent/history?target=${target}&limit=20`);
    return {
        contents: (read.body.messages as { content: string }[]).map((message) => message.content),
        status: read.status,
    };
}

test('#ops has no Agent members', async () => {
    expect(
        await fixture.harness.sql`
            select agent_id from channel_agent_participants where chat_id = ${opsId}
        `
    ).toEqual([]);
});

test('an Agent outside #ops assigned a filed Task there reads it, posts in it, and closes it', async () => {
    const { owner, serverId } = fixture;
    const { task } = await owner.trpc.task.create.mutate({
        assigneeAgentId: fixture.peerAgentId,
        projectId: opsId,
        serverId,
        title: 'Rotate the ops credentials',
    });
    expect(task.key).toBe('OPS-1');
    const peer = await fixture.mintRunner('run_open_access_peer', fixture.peerAgentId);

    const sent = await agentCall(peer, '/api/agent/messages/send', {
        content: 'Picking this up now.',
        nonce: 'open-access-peer-send',
        target: 'task:OPS-1',
    });
    expect(sent).toMatchObject({ body: { state: 'sent' }, status: 200 });
    const reply = await humanSend(task.chatId ?? '', 'The old key expires Friday.');
    expect(await inboxAgentsFor(reply.message.id)).toEqual([]);

    expect(await historyContents(peer, 'task:OPS-1')).toEqual({
        contents: ['Picking this up now.', 'The old key expires Friday.'],
        status: 200,
    });
    expect(await agentCall(peer, `/api/agent/messages/${reply.message.id}`)).toMatchObject({
        body: { message: { content: 'The old key expires Friday.' } },
        status: 200,
    });
    expect(await agentCall(peer, '/api/agent/tasks/show?key=OPS-1')).toMatchObject({
        body: { task: { key: 'OPS-1', state: 'open' } },
        status: 200,
    });
    expect(
        await agentCall(peer, '/api/agent/reminders/schedule', {
            commandId: 'open-access-peer-reminder',
            fireAt: new Date(Date.now() + 3_600_000).toISOString(),
            target: 'task:OPS-1',
            title: 'Confirm the new key works',
        })
    ).toMatchObject({ body: { reminder: { anchorTarget: 'task:OPS-1' } }, status: 200 });
    expect(
        await agentCall(peer, '/api/agent/tasks/state', { key: 'OPS-1', state: 'done' })
    ).toMatchObject({ body: { task: { key: 'OPS-1', state: 'done' } }, status: 200 });
});

test('an Agent assigned a Task in #ops posts in it but still cannot post in #ops', async () => {
    const orbit = await fixture.mintRunner('run_open_access_orbit');
    await humanSend(fixture.channelId, 'The ops dashboard is down');
    const { task: filed } = await fixture.owner.trpc.task.create.mutate({
        assigneeAgentId: fixture.orbitAgentId,
        projectId: opsId,
        serverId: fixture.serverId,
        title: 'Restore the ops dashboard',
    });
    expect(filed.key).toBe('OPS-2');

    expect(
        await agentCall(orbit, '/api/agent/messages/send', {
            content: 'Looking at the dashboard host.',
            nonce: 'open-access-orbit-send',
            target: 'task:OPS-2',
        })
    ).toMatchObject({ body: { state: 'sent' }, status: 200 });
    const task = await fixture.owner.trpc.task.get.query({
        key: 'OPS-2',
        serverId: fixture.serverId,
    });
    const reply = await humanSend(task.chatId ?? '', 'It went down at noon.');
    expect(await inboxAgentsFor(reply.message.id)).toEqual([]);
    const inbox = await agentCall(orbit, '/api/agent/inbox/conversations');
    expect((inbox.body.items as { target: string }[]).map((item) => item.target)).toEqual([
        '#product',
    ]);
    expect(await historyContents(orbit, 'task:OPS-2')).toEqual({
        contents: ['Looking at the dashboard host.', 'It went down at noon.'],
        status: 200,
    });

    expect(
        await agentCall(orbit, '/api/agent/messages/send', {
            content: 'Posting top-level in #ops.',
            nonce: 'open-access-orbit-channel',
            target: '#ops',
        })
    ).toEqual({
        body: {
            code: 'INVALID_TARGET',
            message: 'That target does not exist or this Agent has not joined it.',
        },
        status: 404,
    });
    expect(await agentCall(orbit, '/api/agent/history?target=%23ops')).toMatchObject({
        body: { code: 'INVALID_TARGET' },
        status: 404,
    });
});
