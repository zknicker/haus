import { expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { testSqlAgentHome } from './agent-home.ts';
import { seedTaskAgent } from './task-agent.fixture.ts';

const fixture = agentCreationFixture();

async function seedTurn(
    agentId: string,
    turn: { endedAt: string; startedAt: string; status: string }
) {
    await fixture.harness.sql`
        insert into agent_turns (id, server_id, agent_id, computer_id, run_id, started_at,
            ended_at, status, summary)
        values (${createOpaqueId('atn')}, ${fixture.serverId}, ${agentId}, ${fixture.computerId},
            ${createOpaqueId('run')}, ${turn.startedAt}, ${turn.endedAt}, ${turn.status}, '')
    `;
}

test('a Captain’s crew lifecycle lists its settled crew turns and archived crew, newest first', async () => {
    const projectId = await testSqlAgentHome(fixture.harness.sql, fixture.serverId);
    const crew = { computerId: fixture.computerId, projectId, serverId: fixture.serverId };
    const haiku = await seedTaskAgent(fixture.harness, {
        ...crew,
        captainId: fixture.orbitAgentId,
    });
    const notes = await seedTaskAgent(fixture.harness, {
        ...crew,
        captainId: fixture.orbitAgentId,
    });
    const other = await seedTaskAgent(fixture.harness, { ...crew, captainId: fixture.peerAgentId });
    await seedTurn(haiku.agentId, {
        endedAt: '2026-11-26T10:00:23Z',
        startedAt: '2026-11-26T10:00:00Z',
        status: 'completed',
    });
    await seedTurn(notes.agentId, {
        endedAt: '2026-11-26T10:00:20Z',
        startedAt: '2026-11-26T10:00:01Z',
        status: 'failed',
    });
    await seedTurn(notes.agentId, {
        endedAt: '2026-11-26T09:00:20Z',
        startedAt: '2026-11-26T09:00:01Z',
        status: 'interrupted',
    });
    await seedTurn(other.agentId, {
        endedAt: '2026-11-26T10:05:00Z',
        startedAt: '2026-11-26T10:04:00Z',
        status: 'completed',
    });
    await fixture.harness.sql`
        update tasks set archived_at = '2026-11-26T10:01:00Z' where id = ${haiku.taskId}
    `;

    const lifecycle = await fixture.owner.trpc.task.crewLifecycle.query({
        captainId: fixture.orbitAgentId,
        serverId: fixture.serverId,
    });

    expect(lifecycle.turns.map((turn) => [turn.shortId, turn.status])).toEqual([
        [haiku.shortId, 'completed'],
        [notes.shortId, 'failed'],
    ]);
    expect(lifecycle.turns[0]).toMatchObject({
        endedAt: '2026-11-26T10:00:23.000Z',
        startedAt: '2026-11-26T10:00:00.000Z',
        taskId: haiku.taskId,
        title: 'Seeded Task',
    });
    expect(lifecycle.archives).toEqual([
        {
            archivedAt: '2026-11-26T10:01:00.000Z',
            shortId: haiku.shortId,
            taskId: haiku.taskId,
            title: 'Seeded Task',
        },
    ]);
});
