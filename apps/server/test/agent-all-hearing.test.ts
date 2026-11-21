import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readRoutingAgents } from '../src/message-routing/context.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentHearingFixture } from './agent-hearing.fixture.ts';
import { createInlineReplyHelpers } from './haus-inline-replies-helpers.ts';

const hearing = agentHearingFixture();
const { agents, fixture, heard, send } = hearing;
const { sendAgentMessage } = createInlineReplyHelpers(fixture);
const everyone = ['ari', 'bex', 'cove', 'cyl', 'dov', 'gus', 'orbit', 'peer'];
let connection: HausConnection;
let allTarget = '';

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    const [all] = (await fixture.harness.sql`
        select name from chats where id = ${hearing.hausId}
    `) as { name: string }[];
    allTarget = `#${all?.name}`;
});

afterAll(async () => {
    await connection?.close();
});

test('an unaddressed message in #all reaches every active Agent, wherever it lives', async () => {
    expect(await heard(await send(hearing.hausId, 'Team-wide update.'))).toEqual(everyone);
});

test('an Agent posting in #all is not among its own hearers', async () => {
    const orbit = await fixture.mintRunner(
        createOpaqueId('run'),
        fixture.orbitAgentId,
        hearing.hausId
    );
    const sent = await sendAgentMessage(orbit.token, {
        content: 'Release notes are out.',
        nonce: createOpaqueId('n'),
        target: allTarget,
    });

    expect(sent.body.state).toBe('sent');
    expect(await heard(sent.body.message?.id ?? '')).toEqual(
        everyone.filter((handle) => handle !== 'orbit')
    );
});

test('ADR 0030 candidates in #all are every active Agent', async () => {
    const message = await send(hearing.hausId, 'Who can take the release?');
    const routing = await readRoutingAgents(connection.db, fixture.serverId, hearing.hausId);

    expect(routing.map((agent) => agent.handle).toSorted()).toEqual(everyone);
    expect(await routingCandidates(message)).toEqual(everyoneIds());
});

test('a retired Agent does not hear #all', async () => {
    const rex = await fixture.createAgent('Rex', 'rex');
    expect(await heard(await send(hearing.hausId, 'Before Rex retires.'))).toEqual(
        [...everyone, 'rex'].toSorted()
    );
    await fixture.owner.trpc.agent.delete.mutate({
        agentId: rex,
        confirmation: 'Rex',
        serverId: fixture.serverId,
    });

    expect(await heard(await send(hearing.hausId, 'After Rex retires.'))).toEqual(everyone);
});

function everyoneIds() {
    return [
        agents.ari,
        agents.bex,
        fixture.coveAgentId,
        agents.cyl,
        agents.dov,
        agents.gus,
        fixture.orbitAgentId,
        fixture.peerAgentId,
    ].toSorted() as string[];
}

async function routingCandidates(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select delivery_routing from chat_messages where id = ${messageId}
    `) as { delivery_routing: { candidateAgentIds: string[] } | null }[];
    return row?.delivery_routing?.candidateAgentIds ?? null;
}
