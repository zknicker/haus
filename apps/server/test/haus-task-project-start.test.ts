import { beforeAll, expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
let runner: { token: string };
let bea: HausClient;
let allId: string;
let allTarget: string;
let opsId: string;

interface StartReceipt {
    code?: string;
    message?: string;
    nextAction?: string;
    target?: string;
    task?: { shortId: string };
}

async function startTask(body: Record<string, unknown>) {
    const response = await fetch(new URL('/api/agent/tasks/start', fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as StartReceipt, status: response.status };
}

function send(chatId: string, content: string) {
    return fixture.owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce: createOpaqueId('non'),
        serverId: fixture.serverId,
    });
}

async function taskChatParent(chatId: string) {
    const [row] = (await fixture.harness.sql`
        select parent_chat_id from chats where id = ${chatId}
    `) as { parent_chat_id: string }[];
    return row?.parent_chat_id;
}

beforeAll(async () => {
    const { owner, serverId } = fixture;
    runner = await fixture.mintRunner('run_task_project_start');
    bea = await fixture.signIn('user_task_project_bea', ['bea-projects@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'bea-projects@haus.test',
        serverId,
    });
    await bea.trpc.invitation.accept.mutate({ token });
    await fixture.harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${fixture.channelId}, ${await fixture.readUserId('user_task_project_bea')})
    `;
    const [all] = (await fixture.harness.sql`
        select id, name from chats where server_id = ${serverId} and is_all
    `) as { id: string; name: string }[];
    allId = all?.id ?? '';
    allTarget = `#${all?.name}`;
    opsId = (await owner.trpc.project.create.mutate({ key: 'OPS', name: 'ops', serverId })).chat.id;
});

test('a DM origin starts a Task in the Agent’s home Project, shown only to that DM’s readers', async () => {
    const { owner, serverId } = fixture;
    const dm = await owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: 'Can you look into the deploy?',
        nonce: 'task_project_dm',
        serverId,
        targetKind: 'agent-dm',
    });
    const started = await startTask({
        from: dm.message.id,
        target: 'dm:@ada',
        title: 'Look into the deploy',
    });
    expect(started.status).toBe(200);
    const shortId = started.body.task?.shortId ?? '';
    expect(started.body.target).toBe(`task:${shortId}`);

    const seen = await owner.trpc.task.get.query({ serverId, shortId });
    expect(seen).toMatchObject({
        origin: { chatId: dm.message.chatId, messageId: dm.message.id },
        projectId: fixture.channelId,
    });
    expect(await taskChatParent(seen.chatId ?? '')).toBe(fixture.channelId);
    expect((await bea.trpc.task.get.query({ serverId, shortId })).origin).toBeNull();
    expect(
        (await bea.trpc.task.listActive.query({ serverId })).find(
            (task) => task.shortId === shortId
        )?.origin
    ).toBeNull();

    const page = await owner.trpc.chat.messages.query({ chatId: dm.message.chatId, serverId });
    expect(page.tasks.map((task) => [task.shortId, task.originMessageId])).toEqual([
        [shortId, dm.message.id],
    ]);
});

test('an #all origin starts a Task in the Agent’s home Project, and #all previews it', async () => {
    const { serverId } = fixture;
    const origin = await send(allId, '@orbit the changelog is stale');
    const started = await startTask({
        from: origin.message.id,
        target: allTarget,
        title: 'Refresh the changelog',
    });
    expect(started.status).toBe(200);
    const shortId = started.body.task?.shortId ?? '';
    expect(started.body.target).toBe(`task:${shortId}`);

    const seen = await fixture.owner.trpc.task.get.query({ serverId, shortId });
    expect(seen).toMatchObject({
        origin: { chatId: allId, messageId: origin.message.id },
        projectId: fixture.channelId,
    });
    expect(await taskChatParent(seen.chatId ?? '')).toBe(fixture.channelId);
    const page = await fixture.owner.trpc.chat.messages.query({ chatId: allId, serverId });
    expect(page.tasks.map((task) => [task.shortId, task.originMessageId])).toEqual([
        [shortId, origin.message.id],
    ]);
});

test('--project files a channel origin in another Project; the origin channel previews it', async () => {
    const { serverId } = fixture;
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: fixture.orbitAgentId,
        projectId: opsId,
        serverId,
    });
    const origin = await send(fixture.channelId, 'The ops dashboard is down');
    const started = await startTask({
        from: origin.message.id,
        project: 'OPS',
        target: '#product',
        title: 'Restore the ops dashboard',
    });
    expect(started.status).toBe(200);
    const shortId = started.body.task?.shortId ?? '';
    expect(started.body.target).toBe(`task:${shortId}`);

    const task = await fixture.owner.trpc.task.get.query({ serverId, shortId });
    expect(task).toMatchObject({
        origin: { chatId: fixture.channelId, messageId: origin.message.id },
        projectId: opsId,
    });
    expect(await taskChatParent(task.chatId ?? '')).toBe(opsId);
    const previewKeys = async (chatId: string) =>
        (await fixture.owner.trpc.chat.messages.query({ chatId, serverId })).tasks.map(
            (preview) => preview.shortId
        );
    expect(await previewKeys(fixture.channelId)).toEqual([shortId]);
    expect(await previewKeys(opsId)).toEqual([]);
});

test('an Agent starts only in its home Project; elsewhere it is TASK_PROJECT_NOT_HOME', async () => {
    const { harness, serverId } = fixture;
    await harness.sql`
        update agents set home_project_id = ${fixture.channelId} where id = ${fixture.orbitAgentId}
    `;
    await harness.sql`
        update agents set home_project_id = ${opsId} where id = ${fixture.peerAgentId}
    `;
    const origin = await send(fixture.channelId, 'Rotate the ops credentials');

    expect(
        await startTask({
            from: origin.message.id,
            project: 'OPS',
            target: '#product',
            title: 'Rotate the ops credentials',
        })
    ).toEqual({
        body: {
            code: 'TASK_PROJECT_NOT_HOME',
            message:
                'You start Tasks only in your Project, and #ops is another Project. Its Agent starts Tasks there.',
            nextAction: '@mention @peer in #ops with the request; it starts the Task.',
        },
        status: 403,
    });
    const home = await startTask({
        from: origin.message.id,
        target: '#product',
        title: 'Rotate the product credentials',
    });
    expect(home.status).toBe(200);
    const shortId = home.body.task?.shortId ?? '';
    expect((await fixture.owner.trpc.task.get.query({ serverId, shortId })).projectId).toBe(
        fixture.channelId
    );
});
