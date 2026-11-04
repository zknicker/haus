import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

/**
 * References through the send paths: an Agent writes a bare key (ADR 0051), its
 * message carries `taskLinks` to the App and `task_links` to Agents, and the Task
 * hears about it so an open one refreshes Mentioned in.
 */
const fixture = agentCreationFixture();
let runner: { token: string };
let boardId: string;

beforeAll(async () => {
    runner = await fixture.mintRunner('run_task_send_links');
    const [general] = await fixture.owner.trpc.board.list.query({ serverId: fixture.serverId });
    boardId = general?.id ?? '';
});

async function createTask(title: string) {
    const { serverId } = fixture;
    return (await fixture.owner.trpc.task.create.mutate({ boardId, serverId, title })).task;
}

async function agentCall(path: string, body?: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: body === undefined ? 'GET' : 'POST',
    });
    return (await response.json()) as Record<string, any>;
}

test('an Agent send resolves a bare key, projects it both ways, and updates the Task', async () => {
    const { channelId, owner, serverId } = fixture;
    const task = await createTask('Referenced by an Agent');
    const realtime = captureAllTopics();
    realtime.clear();

    const sent = await agentCall('/api/agent/messages/send', {
        content: `Starting ${task.key}, then \`${task.key}\` stays code.`,
        nonce: 'task_send_links_agent',
        target: '#product',
    });
    expect(sent.state).toBe('sent');

    const updates = (await publishedSince(realtime, serverId)).filter(
        (event) => event.type === 'task.updated'
    );
    expect(updates).toEqual([
        {
            boardId,
            serverId,
            taskId: task.id,
            type: 'task.updated',
            version: task.version,
        },
    ]);
    realtime.stop();

    const page = await owner.trpc.chat.messages.query({ chatId: channelId, limit: 5, serverId });
    const message = page.messages.find((candidate) => candidate.id === sent.message.id);
    expect(message?.taskLinks).toEqual([{ key: task.key, taskId: task.id, text: task.key }]);

    const read = await agentCall(`/api/agent/messages/${sent.message.id}`);
    expect(read.message.task_links).toEqual([{ key: task.key, task_id: task.id, text: task.key }]);

    const detail = await owner.trpc.task.get.query({ serverId, taskId: task.id });
    expect(detail.mentions.map((mention) => mention.messageId)).toEqual([sent.message.id]);
    expect(detail.version).toBe(task.version);
});

test('an Agent-created claim records the Tasks its title references', async () => {
    const { serverId } = fixture;
    const task = await createTask('Referenced by a claim');
    const realtime = captureAllTopics();
    realtime.clear();

    const created = await agentCall('/api/agent/claims/create', {
        nonce: 'task_send_links_claim',
        target: '#product',
        titles: [`Follow up on ${task.key}`],
    });
    expect(created.claims).toHaveLength(1);

    const updates = await publishedSince(realtime, serverId);
    expect(updates.some((event) => event.type === 'task.updated')).toBe(true);
    realtime.stop();
    const detail = await fixture.owner.trpc.task.get.query({ serverId, taskId: task.id });
    expect(detail.mentions).toHaveLength(1);
});

test('a human send announces each referenced Task once, however often it is named', async () => {
    const { channelId, owner, serverId } = fixture;
    const task = await createTask('Referenced twice');
    const realtime = captureAllTopics();
    realtime.clear();
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `${task.key} and again ${task.key}.`,
        nonce: 'task-send-links-human',
        serverId,
    });
    const published = await publishedSince(realtime, serverId);
    expect(published.filter((event) => event.type === 'task.updated')).toHaveLength(1);
    realtime.stop();
});
