import { beforeAll, expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let opsId: string;
let opsAgentId: string;

beforeAll(async () => {
    const { owner, serverId } = fixture;
    opsId = (await owner.trpc.project.create.mutate({ key: 'OPS', name: 'ops', serverId })).chat.id;
    opsAgentId = await fixture.createAgent('Opsy', 'opsy');
    await owner.trpc.agent.setHome.mutate({ agentId: opsAgentId, projectId: opsId, serverId });
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

test('#ops is home to its own Agent only', async () => {
    expect(
        await fixture.harness.sql`
            select id from agents where home_project_id = ${opsId}
        `
    ).toEqual([{ id: opsAgentId }]);
});

test('an Agent outside #ops reads a filed Task there, posts in it, and archives it', async () => {
    const { owner, serverId } = fixture;
    const { task } = await owner.trpc.task.create.mutate({
        projectId: opsId,
        serverId,
        title: 'Rotate the ops credentials',
    });
    const target = `task:${task.shortId}`;
    const peer = await fixture.mintRunner('run_open_access_peer', fixture.peerAgentId);

    const sent = await agentCall(peer, '/api/agent/messages/send', {
        content: 'Picking this up now.',
        nonce: 'open-access-peer-send',
        target,
    });
    expect(sent).toMatchObject({ body: { state: 'sent' }, status: 200 });
    const reply = await humanSend(task.chatId ?? '', 'The old key expires Friday.');
    expect(await inboxAgentsFor(reply.message.id)).toEqual(
        [opsAgentId, fixture.peerAgentId].toSorted()
    );

    expect(await historyContents(peer, target)).toEqual({
        contents: ['Picking this up now.', 'The old key expires Friday.'],
        status: 200,
    });
    expect(await agentCall(peer, `/api/agent/messages/${reply.message.id}`)).toMatchObject({
        body: { message: { content: 'The old key expires Friday.' } },
        status: 200,
    });
    expect(await agentCall(peer, `/api/agent/tasks/show?task=${task.shortId}`)).toMatchObject({
        body: { task: { archivedAt: null, shortId: task.shortId } },
        status: 200,
    });
    expect(
        await agentCall(peer, '/api/agent/reminders/schedule', {
            commandId: 'open-access-peer-reminder',
            fireAt: new Date(Date.now() + 3_600_000).toISOString(),
            target,
            title: 'Confirm the new key works',
        })
    ).toMatchObject({ body: { reminder: { anchorTarget: target } }, status: 200 });
    const archived = await agentCall(peer, '/api/agent/tasks/archive', { task: task.shortId });
    expect(archived).toMatchObject({ body: { task: { shortId: task.shortId } }, status: 200 });
    expect((archived.body.task as { archivedAt: string | null }).archivedAt).not.toBeNull();
});

test('an Agent outside #ops that posts in a Task there hears it, and posts in #ops', async () => {
    const opsy = await fixture.mintRunner('run_open_access_opsy', opsAgentId, opsId);
    const orbit = await fixture.mintRunner('run_open_access_orbit');
    const origin = await humanSend(fixture.channelId, 'The ops dashboard is down');
    const started = await agentCall(opsy, '/api/agent/tasks/start', {
        from: origin.message.id,
        project: 'OPS',
        target: '#product',
        title: 'Restore the ops dashboard',
    });
    expect(started.status).toBe(200);
    const target = started.body.target as string;
    const { shortId } = started.body.task as { shortId: string };
    expect(target).toBe(`task:${shortId}`);

    expect(
        await agentCall(orbit, '/api/agent/messages/send', {
            content: 'Looking at the dashboard host.',
            nonce: 'open-access-orbit-send',
            target,
        })
    ).toMatchObject({ body: { state: 'sent' }, status: 200 });
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    const reply = await humanSend(task.chatId ?? '', 'It went down at noon.');
    expect(await inboxAgentsFor(reply.message.id)).toEqual(
        [opsAgentId, fixture.orbitAgentId].toSorted()
    );
    const inbox = await agentCall(orbit, '/api/agent/inbox/conversations');
    expect((inbox.body.items as { target: string }[]).map((item) => item.target)).toEqual([
        target,
        '#product',
    ]);
    expect(await historyContents(orbit, target)).toEqual({
        contents: ['Looking at the dashboard host.', 'It went down at noon.'],
        status: 200,
    });

    expect(
        await agentCall(orbit, '/api/agent/messages/send', {
            content: 'Posting top-level here.',
            nonce: 'open-access-orbit-channel',
            target: '#ops',
        })
    ).toMatchObject({ body: { state: 'sent' }, status: 200 });
    expect(await historyContents(orbit, '%23ops')).toEqual({
        contents: ['Posting top-level here.'],
        status: 200,
    });
});
