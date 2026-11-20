import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readRoutingAgents } from '../src/message-routing/context.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createTestProject } from './project.fixture.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

const fixture = agentCreationFixture();
let connection: HausConnection;
const agents: Record<string, string> = {};
const projects: Record<string, { id: string; key: string }> = {};
let hausId: string;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    for (const handle of ['ari', 'cyl', 'bex', 'dov', 'gus']) {
        agents[handle] = await fixture.createAgent(handle, handle);
    }
    for (const [name, key, homed] of [
        ['web', 'WEB', ['ari', 'cyl']],
        ['api', 'API', ['bex', 'dov']],
        ['empty', 'EMPTY', []],
        ['spare', 'SPARE', []],
    ] as const) {
        const chat = await createTestProject(fixture.owner, {
            agentIds: homed.map((handle) => agents[handle] ?? ''),
            key,
            name,
            serverId: fixture.serverId,
        });
        projects[name] = { id: chat.id, key };
    }
    const [haus] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string }[];
    hausId = haus?.id ?? '';
});

afterAll(async () => {
    await connection?.close();
});

test('a message in its home Project channel reaches every home Agent', async () => {
    expect(await heard(await send(project('web'), 'Morning, web.'))).toEqual(['ari', 'cyl']);
});

test('a message in a home Project Task reaches every home Agent without a follow', async () => {
    const task = await startTask('web', 'Ship the landing page');

    expect(await heard(await send(task.chatId, 'Progress on the page.'))).toEqual(['ari', 'cyl']);
});

test('another Project channel reaches an Agent at top level only on a mention', async () => {
    expect(await heard(await send(project('web'), 'Plain web traffic.'))).toEqual(['ari', 'cyl']);
    expect(await heard(await send(project('web'), 'Can @bex check the API?'))).toEqual([
        'ari',
        'bex',
        'cyl',
    ]);
});

test('an inline reply reaches the home Agents first, then only mentions and chain followers', async () => {
    const root = await send(project('web'), 'Which cache do we keep?');

    expect(await heard(await send(project('web'), 'The edge one?', root))).toEqual(['ari', 'cyl']);
    expect(await heard(await send(project('web'), '@bex do you agree?', root))).toEqual(['bex']);
    expect(await heard(await send(project('web'), 'Waiting on that.', root))).toEqual(['bex']);
});

test('another Project Task reaches an Agent on a mention, then while it follows', async () => {
    const task = await startTask('web', 'Wire the checkout');

    expect(await heard(await send(task.chatId, 'Quiet note.'))).toEqual(['ari', 'cyl']);
    expect(await heard(await send(task.chatId, '@bex the payload changed.'))).toEqual([
        'ari',
        'bex',
        'cyl',
    ]);
    expect(await heard(await send(task.chatId, 'Following up.'))).toEqual(['ari', 'bex', 'cyl']);

    expect(await unfollow('bex', task)).toBe(200);
    expect(await heard(await send(task.chatId, 'After the unfollow.'))).toEqual(['ari', 'cyl']);
});

test('unfollowing a home Task changes nothing', async () => {
    const task = await startTask('web', 'Tune the images');

    expect(await unfollow('ari', task)).toBe(200);
    expect(await heard(await send(task.chatId, 'Still yours.'))).toEqual(['ari', 'cyl']);
});

test('a DM reaches its Agent wherever it lives', async () => {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        agentId: agents.bex ?? '',
        content: 'Quick question.',
        nonce: createOpaqueId('n'),
        serverId: fixture.serverId,
        targetKind: 'agent-dm',
    });

    expect(await heard(sent.message.id)).toEqual(['bex']);
});

test('a generalist hears the Haus project and elsewhere only its mentions', async () => {
    expect(await heard(await send(hausId, 'Haus-wide update.'))).toEqual(['cove', 'gus', 'peer']);
    expect(await heard(await send(project('api'), 'API only.'))).toEqual(['bex', 'dov']);
    expect(await heard(await send(project('api'), '@gus take a look.'))).toEqual([
        'bex',
        'dov',
        'gus',
    ]);
});

test('ADR 0030 judges only among the Project home Agents', async () => {
    const message = await send(project('web'), 'Who wants this one?');

    expect(await routingHandles('web')).toEqual(['ari', 'cyl']);
    expect(await routingHandles('web', [agents.gus ?? ''])).toEqual(['ari', 'cyl', 'gus']);
    expect(await routingCandidates(message)).toEqual(
        [agents.ari, agents.cyl].toSorted() as string[]
    );
});

test('a Project with no home Agents reaches every generalist and no other Agent', async () => {
    expect(await heard(await send(project('empty'), 'Anyone here?'))).toEqual([
        'cove',
        'gus',
        'peer',
    ]);
});

test('a Task of a Project with no home Agents reaches the generalists, unfollow or not', async () => {
    const task = await startTask('empty', 'Sort the backlog');
    const queued = await send(task.chatId, 'Where do we start?');

    expect(await heard(queued)).toEqual(['cove', 'gus', 'peer']);
    expect(await unfollow('gus', task)).toBe(200);
    expect(await heard(queued)).toEqual(['cove', 'gus', 'peer']);
    expect(await heard(await send(task.chatId, 'Still on it?'))).toEqual(['cove', 'gus', 'peer']);
});

test('ADR 0030 judges a Project with no home Agents among the generalists', async () => {
    const message = await send(project('empty'), 'Who picks this up?');

    expect(await routingHandles('empty')).toEqual(['cove', 'gus', 'peer']);
    expect(await routingCandidates(message)).toEqual(
        [fixture.coveAgentId, agents.gus, fixture.peerAgentId].toSorted() as string[]
    );
});

test('homing an Agent in a Project stops the generalists hearing it', async () => {
    expect(await heard(await send(project('spare'), 'Before an owner.'))).toEqual([
        'cove',
        'gus',
        'peer',
    ]);
    const eve = await fixture.createAgent('eve', 'eve');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: eve,
        projectId: project('spare'),
        serverId: fixture.serverId,
    });

    expect(await heard(await send(project('spare'), 'After an owner.'))).toEqual(['eve']);
});

test('Cove hears the Owner in #onboarding-owner after its greeting', async () => {
    const [onboarding] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and name = 'onboarding-owner'
    `) as { id: string }[];
    const channelId = onboarding?.id ?? '';
    const cove = await fixture.mintRunner(
        createOpaqueId('run'),
        fixture.coveAgentId,
        channelId,
        false
    );
    const greeting = await fixture.post('/api/agent/messages/send', cove, {
        content: 'Hi, I’m Cove. What should we build first?',
        nonce: createOpaqueId('n'),
        target: '#onboarding-owner',
    });

    expect(greeting.status).toBe(200);
    expect(await heard(await send(channelId, 'A tracker for my reading list.'))).toEqual([
        'cove',
        'gus',
        'peer',
    ]);
});

test('moving an Agent home changes delivery from the next message', async () => {
    const before = await send(project('web'), 'Before the move.');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: agents.dov ?? '',
        projectId: project('web'),
        serverId: fixture.serverId,
    });

    expect(await heard(before)).toEqual(['ari', 'cyl']);
    expect(await heard(await send(project('web'), 'After the move.'))).toEqual([
        'ari',
        'cyl',
        'dov',
    ]);
    expect(await heard(await send(project('api'), 'API after the move.'))).toEqual(['bex']);
});

function project(name: string) {
    const found = projects[name];
    if (!found) {
        throw new Error(`No test Project ${name}.`);
    }
    return found.id;
}

async function send(chatId: string, content: string, replyToMessageId?: string) {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce: createOpaqueId('n'),
        replyToMessageId,
        serverId: fixture.serverId,
    });
    return sent.message.id;
}

async function startTask(name: string, title: string) {
    return await startTestTask(fixture.harness, fixture.owner, {
        channelId: project(name),
        key: projects[name]?.key,
        serverId: fixture.serverId,
        title,
    });
}

async function unfollow(handle: string, task: TestTask) {
    const runner = await fixture.mintRunner(createOpaqueId('run'), agents[handle], task.chatId);
    return (await fixture.post('/api/agent/tasks/unfollow', runner, { target: `task:${task.key}` }))
        .status;
}

async function heard(messageId: string) {
    const rows = (await fixture.harness.sql`
        select agent.handle from agent_inbox item
        join agents agent on agent.server_id = item.server_id and agent.id = item.agent_id
        where item.server_id = ${fixture.serverId} and item.dedupe_key = ${messageId}
        order by agent.handle
    `) as { handle: string }[];
    return rows.map((row) => row.handle);
}

async function routingHandles(name: string, mentioned: string[] = []) {
    const routing = await readRoutingAgents(
        connection.db,
        fixture.serverId,
        project(name),
        mentioned
    );
    return routing.map((agent) => agent.handle).toSorted();
}

async function routingCandidates(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select delivery_routing from chat_messages where id = ${messageId}
    `) as { delivery_routing: { candidateAgentIds: string[] } | null }[];
    return row?.delivery_routing?.candidateAgentIds ?? null;
}
