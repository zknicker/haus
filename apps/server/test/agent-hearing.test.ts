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

test('an Agent the migration left in the Haus project hears it as its home, and elsewhere only its mentions', async () => {
    expect(await heard(await send(hearing.hausId, 'Haus-wide update.'))).toEqual(['cove']);
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

test('a Project with no home Captain reaches only mentions', async () => {
    const task = await startTask('empty', 'Sort the backlog');

    expect(await heard(await send(project('empty'), 'Anyone here?'))).toEqual([]);
    expect(await heard(await send(task.chatId, 'Where do we start?'))).toEqual([]);
    expect(await routingHandles('empty')).toEqual([]);
    expect(await heard(await send(project('empty'), '@gus can you look?'))).toEqual(['gus']);
    expect(await heard(await send(task.chatId, '@peer this one is yours.'))).toEqual(['peer']);
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
