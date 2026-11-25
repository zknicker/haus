import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { dispatchWorkerTurns } from '../src/workers/dispatch-worker-turns.ts';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
let connection: HausConnection;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});
afterAll(async () => {
    await connection?.close();
});

test('a Worker delete records the Worker as deleter and lists it in Recently deleted', async () => {
    const orbit = await push.orbitWriter();
    const file = await push.publish(
        orbit,
        { path: 'agents/orbit/reports/old.md', request_id: 'fence-seed-old' },
        'old\n'
    );
    const worker = await dispatchWorker();

    expect(
        await push.deleteOutcome(
            { token: worker.token },
            {
                base_revision_id: file.revision_id,
                path: 'agents/orbit/reports/old.md',
                push_id: worker.turnId,
                request_id: 'fence-worker-delete',
            }
        )
    ).toEqual({ current: null, outcome: 'deleted', path: 'agents/orbit/reports/old.md' });
    const deleted = await fixture.owner.trpc.artifact.listDeleted.query({
        prefix: 'agents/orbit/reports',
        serverId: fixture.serverId,
    });
    expect(deleted.deleted.map((record) => record.deleted_by)).toEqual([
        { agent_id: fixture.orbitAgentId, type: 'worker', worker_id: worker.workerId },
    ]);
});

test('a Worker dispatched before a full reset pushes nothing after it', async () => {
    const worker = await dispatchWorker();
    const [turn] = await fixture.harness.sql`
        select t.reset_generation, a.reset_generation as agent_generation
        from worker_turns t join agents a on a.id = ${fixture.orbitAgentId}
        where t.id = ${worker.turnId}`;
    expect(turn?.reset_generation).toBe(turn?.agent_generation);

    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });

    expect(
        await push.putOutcome(
            { token: worker.token },
            {
                path: 'agents/orbit/notes/stale.md',
                push_id: worker.turnId,
                request_id: 'fence-worker-stale',
            },
            'stale\n'
        )
    ).toMatchObject({ code: 'AGENT_RESET', outcome: 'refused' });
    expect(await push.countRows('artifacts', 'agents/orbit/notes/')).toBe(0);

    const next = await dispatchWorker();
    expectOutcome(
        await push.putOutcome(
            { token: next.token },
            {
                path: 'agents/orbit/notes/fresh.md',
                push_id: next.turnId,
                request_id: 'fence-worker-fresh',
            },
            'fresh\n'
        ),
        'committed'
    );
});

async function dispatchWorker() {
    const db = fixture.harness.sql;
    const [project] =
        await db`select task_key_id from projects where chat_id = ${fixture.channelId}`;
    const taskId = createOpaqueId('tsk');
    const taskChatId = createOpaqueId('cht');
    const workerId = createOpaqueId('wkr');
    const turnId = createOpaqueId('wkt');
    await db`insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
        values (${taskChatId}, ${fixture.serverId}, 'task', ${fixture.channelId}, 'channel')`;
    await db`with entry as (
            update task_keys set next_number = next_number + 1
            where id = ${project?.task_key_id} returning next_number - 1 as number
        )
        insert into tasks (id, server_id, key_id, number, title, chat_id, created_by_user_id, project_id)
        select ${taskId}, ${fixture.serverId}, ${project?.task_key_id}, entry.number, 'Report',
            ${taskChatId}, ${fixture.ownerUserId}, ${fixture.channelId}
        from entry`;
    await db`update computers set workers_enabled = true, health = 'healthy'
        where id = ${fixture.computerId}`;
    await db`insert into workers (id, server_id, agent_id, carrier_computer_id, place, runtime,
            repository, task_id, title)
        values (${workerId}, ${fixture.serverId}, ${fixture.orbitAgentId}, ${fixture.computerId},
            'computer', 'codex', 'haus/haus', ${taskId}, 'Write the report')`;
    await db`insert into worker_turns (id, server_id, worker_id, input)
        values (${turnId}, ${fixture.serverId}, ${workerId}, '[]'::jsonb)`;
    await connection.db.transaction((tx) =>
        dispatchWorkerTurns(tx, push.storage, fixture.serverId)
    );
    const [computer] =
        await db`select credential_hash from computers where id = ${fixture.computerId}`;
    const response = await fetch(
        new URL('/computer/workers/push-credential', fixture.harness.url),
        {
            body: JSON.stringify({ credentialHash: computer?.credential_hash, turnId }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        }
    );
    const minted = (await response.json()) as { token: string };
    return { token: minted.token, turnId, workerId };
}
