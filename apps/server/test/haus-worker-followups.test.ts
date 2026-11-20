import { expect, test } from 'bun:test';
import {
    agentWorkerListReceiptSchema,
    agentWorkerReceiptSchema,
    agentWorkerSendReceiptSchema,
    type WorkerObservation,
    workerReconcileCommandSchema,
    workerTurnsRetained,
} from '@haus/api';
import { sendWorkerReconcile } from '../src/computers/worker-reports.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { registerTestConnections } from './test-computer-connections.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();
const createConnections = registerTestConnections();

test('follow-ups retain one work and provider identity, replay original Runs, and isolate old observations', async () => {
    const runner = await fixture.mintRunner('run_followup');
    const startBody = fixture.startBody({ nonce: 'followup-start' });
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, startBody)).body
    );
    const socket = await fixture.attachComputer();
    const observe = (observation: WorkerObservation) =>
        socket.send(JSON.stringify({ type: 'worker-observation', observation }));
    observe({
        workerId: started.worker.id,
        turnId: started.turnId,
        status: 'running',
        providerAgentId: 'cursor_original',
        providerRunId: 'cursor_first',
        observedAt: '2026-09-06T12:00:00.000Z',
    });
    await fixture.waitForWorkStatus(started.worker.id, 'running');
    const first = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'followup-one')).json()
    );
    const second = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'followup-two')).json()
    );
    expect(first.worker.id).toBe(started.worker.id);
    expect(first.worker.providerAgentId).toBe('cursor_original');
    // The work's newest Run is queued, but the job is the Run still going.
    expect(first.worker.status).toBe('queued');
    expect(first.worker.job).toMatchObject({ followUp: { state: 'waiting' }, state: 'working' });
    expect(first.predecessors.map((run) => run.turnId)).toEqual([started.turnId]);
    expect(second.predecessors.map((run) => run.turnId)).toEqual([started.turnId, first.turnId]);
    const replay = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'followup-one')).json()
    );
    expect(replay.turnId).toBe(first.turnId);
    expect(replay.idempotent).toBe(true);
    expect(replay.predecessors.map((run) => run.turnId)).toEqual([started.turnId]);
    expect((await fixture.postStart(runner, startBody)).body.turnId).toBe(started.turnId);
    observe({
        workerId: started.worker.id,
        turnId: started.turnId,
        status: 'completed',
        summary: 'Original evidence',
        observedAt: '2026-09-06T12:01:00.000Z',
    });
    await fixture.waitFor(
        async () => (await fixture.readRun(started.turnId))?.status === 'completed'
    );
    expect(await fixture.readWork(started.worker.id)).toMatchObject({
        status: 'queued',
        provider_agent_id: 'cursor_original',
        terminal_at: null,
    });
    expect(await fixture.readAttentions(started.turnId)).toHaveLength(1);
    const inspected = agentWorkerListReceiptSchema.parse(
        await (
            await fetch(
                new URL(`/api/agent/workers?workerId=${started.worker.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).json()
    );
    expect(inspected.workers).toHaveLength(1);
    expect(inspected.workers[0]?.turns.map((run) => run.turnId)).toEqual([
        second.turnId,
        first.turnId,
        started.turnId,
    ]);
    // A follow-up queued behind a finished Run leaves the job done, not queued.
    expect(inspected.workers[0]?.job).toEqual({
        followUp: { since: inspected.workers[0]?.turns[0]?.createdAt, state: 'waiting' },
        settledAt: '2026-09-06T12:01:00.000Z',
        startedAt: '2026-09-06T12:00:00.000Z',
        state: 'done',
    });
    socket.close();
});

test('an older Run still reporting behind a queued follow-up keeps the work fresh', async () => {
    const runner = await fixture.mintRunner('run_followup_fresh');
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'fresh-start' }))).body
    );
    const socket = await fixture.attachComputer();
    const observeRunning = (observedAt: string, rawStatus: string) =>
        socket.send(
            JSON.stringify({
                type: 'worker-observation',
                observation: {
                    observedAt,
                    providerAgentId: 'cursor_fresh',
                    rawStatus,
                    turnId: started.turnId,
                    status: 'running',
                    workerId: started.worker.id,
                },
            })
        );
    observeRunning(new Date().toISOString(), 'RUNNING');
    await fixture.waitForWorkStatus(started.worker.id, 'running');
    expect((await send(runner.token, started.worker.id, 'fresh-followup')).ok).toBe(true);
    // Later than the follow-up's own send, so only this observation can explain it.
    const observedAt = new Date(Date.now() + 60_000).toISOString();
    observeRunning(observedAt, 'STILL_RUNNING');
    await fixture.waitFor(
        async () => (await fixture.readRun(started.turnId))?.raw_status === 'STILL_RUNNING'
    );
    const listed = agentWorkerListReceiptSchema.parse(
        await (
            await fetch(
                new URL(`/api/agent/workers?workerId=${started.worker.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).json()
    );
    expect(listed.workers[0]).toMatchObject({ status: 'queued', updatedAt: observedAt });
    socket.close();
});

test('send requires delegator identity and its current assigned Computer', async () => {
    const runner = await fixture.mintRunner('run_followup_auth');
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-auth' }))).body
    );
    expect((await send(null, started.worker.id, 'no-auth')).status).toBe(401);
    expect((await send(runner.token, started.worker.id, 'not-launched')).status).toBe(409);
    const { agent: other } = await fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: 'Other',
        handle: 'other',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
    });
    await fixture.harness
        .sql`update workers set agent_id = ${other.id} where id = ${started.worker.id}`;
    expect((await send(runner.token, started.worker.id, 'wrong-agent')).status).toBe(404);
    expect(
        (
            await fetch(
                new URL(`/api/agent/workers?workerId=${started.worker.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).status
    ).toBe(404);
    await fixture.harness
        .sql`update workers set agent_id = ${fixture.orbitAgentId} where id = ${started.worker.id}`;
    await fixture.harness
        .sql`update agents set computer_id = null, desired_model_id = null, desired_runtime_id = null where id = ${fixture.orbitAgentId}`;
    expect((await send(runner.token, started.worker.id, 'wrong-computer')).status).toBe(404);
    await fixture.harness
        .sql`update agents set computer_id = ${fixture.computerId}, desired_model_id = 'gpt-5.6-sol', desired_runtime_id = 'codex' where id = ${fixture.orbitAgentId}`;
});

function send(token: string | null, workerId: string, nonce: string) {
    return fetch(new URL('/api/agent/workers/send', fixture.harness.url), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ workerId, nonce }),
    });
}

test('reconnect includes live predecessors beyond the retained card Runs even after current Run settles', async () => {
    const runner = await fixture.mintRunner('run_followup_reconnect');
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-reconnect' }))).body
    );
    await fixture.harness
        .sql`update workers set provider_agent_id = 'cursor_reconnect' where id = ${started.worker.id}`;
    const turnIds = [started.turnId];
    let latest = started.turnId;
    for (let index = 0; index < workerTurnsRetained + 1; index += 1) {
        const receipt = agentWorkerSendReceiptSchema.parse(
            await (await send(runner.token, started.worker.id, `reconnect-${index}`)).json()
        );
        latest = receipt.turnId;
        turnIds.push(latest);
    }
    expect((await fixture.postCancel(runner, started.worker.id)).status).toBe(200);
    await fixture.harness
        .sql`update worker_turns set status = 'completed', terminal_at = now() where id = ${latest}`;
    await fixture.harness
        .sql`update workers set status = 'completed', terminal_at = now() where id = ${started.worker.id}`;
    const socket = new WebSocket(fixture.computerSocketUrl());
    await fixture.opened(socket);
    const reconciled = new Promise<string[]>((resolve) =>
        socket.addEventListener('message', (event) => {
            const parsed = workerReconcileCommandSchema.safeParse(JSON.parse(String(event.data)));
            if (parsed.success) {
                resolve(
                    parsed.data.workers
                        .filter((run) => run.workerId === started.worker.id)
                        .map((run) => run.turnId)
                );
            }
        })
    );
    socket.send(JSON.stringify(fixture.bootstrapFrame()));
    expect(await reconciled).toEqual(turnIds.slice(0, -1));
    socket.close();
    const resumed = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'after-terminal')).json()
    );
    expect(resumed.worker.status).toBe('queued');
    expect(resumed.worker.terminalAt).toBeNull();
    expect(resumed.worker.cancelRequestedAt).toBeNull();
    expect(resumed.worker.turns.find((run) => run.turnId === latest)?.status).toBe('completed');
});

test('reconnect chunks more than 200 live Runs into valid frames without dropping Runs', async () => {
    const runner = await fixture.mintRunner('run_reconcile_chunks');
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'reconcile-chunks' }))).body
    );
    await fixture.harness.sql`
        insert into worker_turns (id, server_id, worker_id, created_at)
        select 'car_' || lpad(number::text, 16, '0'), ${fixture.serverId}, ${started.worker.id},
               now() + number * interval '1 millisecond'
        from generate_series(1, 401) as number
    `;
    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    const connections = createConnections();
    const frames: unknown[] = [];
    connections.register(fixture.computerId, {
        ordinary: true,
        send: (frame) => frames.push(frame),
        serverId: fixture.serverId,
        updatePhase: 'complete',
    });
    try {
        await sendWorkerReconcile(connection.db, connections, {
            id: fixture.computerId,
            serverId: fixture.serverId,
        });
        const parsed = frames.map((frame) => workerReconcileCommandSchema.parse(frame));
        expect(parsed).toHaveLength(3);
        expect(parsed.slice(0, 2).map((frame) => frame.workers.length)).toEqual([200, 200]);
        const turnIds = parsed
            .flatMap((frame) => frame.workers)
            .filter((run) => run.workerId === started.worker.id)
            .map((run) => run.turnId);
        expect(turnIds).toHaveLength(402);
        expect(new Set(turnIds).size).toBe(402);
        expect(turnIds).toContain(started.turnId);
        for (let number = 1; number <= 401; number += 1) {
            expect(turnIds).toContain(`car_${String(number).padStart(16, '0')}`);
        }
    } finally {
        connections.unregister(fixture.computerId);
        await connection.close();
    }
});
