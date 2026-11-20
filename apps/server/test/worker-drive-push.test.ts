import { expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

async function seedWorkerTurn() {
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
    await db`insert into workers (id, server_id, agent_id, carrier_computer_id, place, runtime,
            repository, task_id, title)
        values (${workerId}, ${fixture.serverId}, ${fixture.orbitAgentId}, ${fixture.computerId},
            'computer', 'codex', 'haus/haus', ${taskId}, 'Write the report')`;
    await db`insert into worker_turns (id, server_id, worker_id, input, dispatched_at, dispatch_attempt)
        values (${turnId}, ${fixture.serverId}, ${workerId}, '[]'::jsonb, now(), 1)`;
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
    return { taskId, token: minted.token, turnId, workerId };
}

test("a Worker push writes as the Worker with its Task and never closes its Agent's run push", async () => {
    const worker = await seedWorkerTurn();
    const run = await push.dispatch('run_worker_isolation');
    const path = 'agents/orbit/reports/W-1/draft.md';
    await push.putOutcome(
        run,
        { path: 'agents/orbit/notes.md', push_id: 'run_worker_isolation', request_id: 'iso-run-1' },
        'run\n'
    );

    const written = expectOutcome(
        await push.putOutcome(
            { token: worker.token },
            { path, push_id: worker.turnId, request_id: 'iso-worker' },
            'worker\n'
        ),
        'committed'
    );

    expect(written.current?.author).toEqual({
        agent_id: fixture.orbitAgentId,
        type: 'worker',
        worker_id: worker.workerId,
    });
    const [revision] = await fixture.harness.sql`
        select author_agent_id, author_worker_id, task_id, author_key from artifact_revisions
        where id = ${written.current?.revision_id ?? ''}`;
    expect(revision).toEqual({
        author_agent_id: fixture.orbitAgentId,
        author_key: `worker:${worker.workerId}`,
        author_worker_id: worker.workerId,
        task_id: worker.taskId,
    });
    expect(await openPushes()).toEqual(['run_worker_isolation', worker.turnId].sort());
    const next = await push.dispatch('run_worker_isolation_next');
    await push.putOutcome(
        next,
        {
            path: 'agents/orbit/more.md',
            push_id: 'run_worker_isolation_next',
            request_id: 'iso-next-1',
        },
        'next\n'
    );
    expect(await openPushes()).toEqual(['run_worker_isolation_next', worker.turnId].sort());
    const runOnWorkerPush = await push.put(
        run,
        { path: 'agents/orbit/x.md', push_id: worker.turnId, request_id: 'iso-cross' },
        'x\n'
    );
    expect(runOnWorkerPush.status).toBe(404);
});

test("a Worker push's conflict goes to its Agent as one drive_conflict item naming the Worker", async () => {
    const worker = await seedWorkerTurn();
    const orbit = await push.orbitWriter();
    const path = 'agents/orbit/reports/W-2/summary.md';
    await push.publish(orbit, { path, request_id: 'conflict-seed' }, 'agent\n');

    expectOutcome(
        await push.putOutcome(
            { token: worker.token },
            { path, push_id: worker.turnId, request_id: 'conflict-worker' },
            'worker\n'
        ),
        'kept_both'
    );
    await push.close({ token: worker.token }, worker.turnId);

    const items = await push.conflictItems(fixture.orbitAgentId);
    const item = items.find((row) => row.dedupe_key.includes(worker.turnId));
    expect(item?.content).toContain(worker.workerId);
});

async function openPushes() {
    const rows = await fixture.harness.sql`
        select id from drive_pushes where server_id = ${fixture.serverId} and closed_at is null
        order by id`;
    return (rows as { id: string }[]).map((row) => row.id).sort();
}
