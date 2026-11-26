import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { RunnerDownFrame } from '@haus/api';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { archiveTask, unarchiveTask } from '../src/tasks/task-archive.ts';
import { announceTaskSessions } from '../src/tasks/task-session.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let connection: HausConnection;
let delivery: AgentDelivery;
const owner = () => ({ kind: 'user', userId: fixture.ownerUserId }) as const;

async function startCrew(runner: { token: string }, brief: string) {
    const response = await fetch(new URL('/api/agent/tasks/start', fixture.harness.url), {
        body: JSON.stringify({ brief, machine: fixture.computerId }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const reply = (await response.json()) as { task: { shortId: string } };
    return await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        shortId: reply.task.shortId,
    });
}

async function session(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select agents.session_generation, agents.session_reset_kind, delivery.stopped,
            (select count(*)::int from agent_inbox where agent_id = agents.id and state = 'queued') as queued
        from agents left join agent_delivery delivery on delivery.agent_id = agents.id
        where agents.id = ${agentId}
    `) as { queued: number; session_generation: number; session_reset_kind: string; stopped: boolean }[];
    return row;
}

function recordingWire() {
    const runner: RunnerDownFrame[] = [];
    const machine: unknown[] = [];
    return {
        machine,
        runner,
        wire: {
            invocations: { archiveSession: (target: unknown) => machine.push(target) },
            runner: { send: (frame: RunnerDownFrame) => runner.push(frame) > 0 },
        },
    };
}

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
});

afterAll(async () => {
    await connection?.close();
});

test('archive frees the session under a new generation; restore starts no turn', async () => {
    const task = await startCrew(await fixture.mintRunner('run_task_archive'), 'Rotate the key.');
    const agentId = task.agentId ?? '';
    const started = await session(agentId);
    expect(started).toMatchObject({ queued: 1, stopped: false });

    const archived = await archiveTask(connection.db, owner(), delivery, {
        expectedVersion: task.version,
        serverId: fixture.serverId,
        taskId: task.id,
    });
    const recorded = recordingWire();
    announceTaskSessions(recorded.wire, archived.sessions ?? []);
    const generation = (started?.session_generation ?? 0) + 1;
    expect(recorded.runner).toEqual([
        { agentId, kind: 'archive', sessionGeneration: generation, type: 'agent-reset' },
    ]);
    expect(recorded.machine).toEqual([
        { agentId, computerId: fixture.computerId, generation, serverId: fixture.serverId },
    ]);
    expect(await session(agentId)).toEqual({
        queued: 0,
        session_generation: generation,
        session_reset_kind: 'full',
        stopped: true,
    });
    expect(archived.task).toMatchObject({ activity: 'idle' });
    expect(archived.task.archivedAt).not.toBeNull();

    const restored = await unarchiveTask(connection.db, owner(), {
        expectedVersion: archived.task.version,
        serverId: fixture.serverId,
        taskId: task.id,
    });
    const quiet = recordingWire();
    announceTaskSessions(quiet.wire, restored.sessions ?? []);
    expect([quiet.runner, quiet.machine]).toEqual([[], []]);
    expect(restored.wakes).toEqual([]);
    expect(restored.task).toMatchObject({ activity: 'idle', archivedAt: null });
    expect(await session(agentId)).toMatchObject({
        queued: 0,
        session_generation: generation + 1,
        stopped: false,
    });
});

test('restore is refused while the Project is archived', async () => {
    const task = await startCrew(await fixture.mintRunner('run_task_archive_project'), 'Ship it.');
    const archived = await archiveTask(connection.db, owner(), delivery, {
        expectedVersion: task.version,
        serverId: fixture.serverId,
        taskId: task.id,
    });
    await fixture.harness.sql`
        update chats set archived_at = now(), archived_by_user_id = ${fixture.ownerUserId}
        where id = ${fixture.channelId}
    `;
    await expect(
        unarchiveTask(connection.db, owner(), {
            expectedVersion: archived.task.version,
            serverId: fixture.serverId,
            taskId: task.id,
        })
    ).rejects.toThrow('Project is archived');
    await fixture.harness.sql`
        update chats set archived_at = null, archived_by_user_id = null where id = ${fixture.channelId}
    `;
});

test('retiring a Captain archives its crew', async () => {
    const kitId = await fixture.createAgent('Kit', 'kit');
    await fixture.owner.trpc.agent.setHome.mutate({
        agentId: kitId,
        projectId: fixture.channelId,
        serverId: fixture.serverId,
    });
    const task = await startCrew(
        await fixture.mintRunner('run_task_archive_kit', kitId),
        'Tune the cache.'
    );
    await fixture.owner.trpc.agent.delete.mutate({
        agentId: kitId,
        confirmation: 'Kit',
        serverId: fixture.serverId,
    });
    const after = await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        taskId: task.id,
    });
    expect(after.archivedAt).not.toBeNull();
    expect(await session(task.agentId ?? '')).toMatchObject({ queued: 0, stopped: true });
});
