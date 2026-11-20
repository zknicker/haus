import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readRoutingAgents } from '../src/message-routing/context.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentHearingFixture } from './agent-hearing.fixture.ts';

const hearing = agentHearingFixture();
const { agents, fixture, heard, project, send, startTask, unfollow } = hearing;
let connection: HausConnection;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
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
    expect(await heard(await send(hearing.hausId, 'Haus-wide update.'))).toEqual([
        'cove',
        'gus',
        'peer',
    ]);
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

test('an unfollow right after a move into the Task home keeps the queued work', async () => {
    agents.hal = await fixture.createAgent('hal', 'hal');
    const task = await startTask('web', 'Audit the fonts');
    await send(task.chatId, '@hal the fonts look off.');
    const queued = await send(task.chatId, 'Two weights are missing.');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: agents.hal,
        projectId: project('web'),
        serverId: fixture.serverId,
    });

    expect(await unfollow('hal', task)).toBe(200);
    expect(await heard(queued)).toEqual(['ari', 'cyl', 'dov', 'hal']);
});

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
