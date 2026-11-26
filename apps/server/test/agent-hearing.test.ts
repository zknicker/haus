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

test("a Project's Captain does not hear an unaddressed message in a Task of its Project", async () => {
    const task = await startTask('web', 'Ship the landing page');

    expect(await heard(await send(task.chatId, 'Progress on the page.'))).toEqual([]);
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

    expect(await heard(await send(task.chatId, 'Quiet note.'))).toEqual([]);
    expect(await heard(await send(task.chatId, '@bex the payload changed.'))).toEqual(['bex']);
    expect(await heard(await send(task.chatId, 'Following up.'))).toEqual(['bex']);

    expect(await unfollow('bex', task)).toBe(200);
    expect(await heard(await send(task.chatId, 'After the unfollow.'))).toEqual([]);
});

test('a home Captain hears its own Project Task only while it follows it', async () => {
    const task = await startTask('web', 'Tune the images');

    expect(await heard(await send(task.chatId, '@ari can you take a look?'))).toEqual(['ari']);
    expect(await heard(await send(task.chatId, 'Still yours.'))).toEqual(['ari']);
    expect(await unfollow('ari', task)).toBe(200);
    expect(await heard(await send(task.chatId, 'After the unfollow.'))).toEqual([]);
});

test('a DM reaches its Agent wherever it lives', async () => {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        agentId: agents.bex ?? '',
        content: 'Quick question.',
        nonce: createOpaqueId('n'),
        serverId: fixture.serverId,
        targetKind: 'captain',
    });

    expect(await heard(sent.message.id)).toEqual(['bex']);
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

test("an unfollow withdraws the Task's queued work, even in the agent's own Project", async () => {
    agents.hal = await fixture.createAgent('hal', 'hal');
    const task = await startTask('web', 'Audit the fonts');
    await send(task.chatId, '@hal the fonts look off.');
    const queued = await send(task.chatId, 'Two weights are missing.');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: agents.hal,
        projectId: project('web'),
        serverId: fixture.serverId,
    });

    expect(await heard(queued)).toEqual(['hal']);
    expect(await unfollow('hal', task)).toBe(200);
    expect(await heard(queued)).toEqual([]);
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
