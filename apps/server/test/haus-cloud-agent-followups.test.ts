import { expect, test } from 'bun:test';
import {
    agentCloudAgentListReceiptSchema,
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    type CloudAgentObservation,
    cloudAgentReconcileCommandSchema,
    cloudAgentRunsRetained,
} from '@haus/api';
import { sendCloudAgentReconcile } from '../src/computers/cloud-agent-reports.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { registerTestConnections } from './test-computer-connections.ts';

const fixture = cloudAgentFixture();
const createConnections = registerTestConnections();

test('follow-ups retain one work and provider identity, replay original Runs, and isolate old observations', async () => {
    const runner = await fixture.mintRunner('run_followup');
    const startBody = fixture.startBody({ nonce: 'followup-start' });
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, startBody)).body
    );
    const socket = await fixture.attachComputer();
    const observe = (observation: CloudAgentObservation) =>
        socket.send(JSON.stringify({ type: 'cloud-agent-observation', observation }));
    observe({
        workId: started.work.id,
        runId: started.runId,
        status: 'running',
        providerAgentId: 'cursor_original',
        providerRunId: 'cursor_first',
        observedAt: '2026-09-06T12:00:00.000Z',
    });
    await fixture.waitForWorkStatus(started.work.id, 'running');
    const first = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'followup-one')).json()
    );
    const second = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'followup-two')).json()
    );
    expect(first.work.id).toBe(started.work.id);
    expect(first.work.providerAgentId).toBe('cursor_original');
    // The work's newest Run is queued, but the job is the Run still going.
    expect(first.work.status).toBe('queued');
    expect(first.work.job).toMatchObject({ followUp: { state: 'waiting' }, state: 'working' });
    expect(first.predecessors.map((run) => run.runId)).toEqual([started.runId]);
    expect(second.predecessors.map((run) => run.runId)).toEqual([started.runId, first.runId]);
    const replay = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'followup-one')).json()
    );
    expect(replay.runId).toBe(first.runId);
    expect(replay.idempotent).toBe(true);
    expect(replay.predecessors.map((run) => run.runId)).toEqual([started.runId]);
    expect((await fixture.postStart(runner, startBody)).body.runId).toBe(started.runId);
    observe({
        workId: started.work.id,
        runId: started.runId,
        status: 'completed',
        summary: 'Original evidence',
        observedAt: '2026-09-06T12:01:00.000Z',
    });
    await fixture.waitFor(
        async () => (await fixture.readRun(started.runId))?.status === 'completed'
    );
    expect(await fixture.readWork(started.work.id)).toMatchObject({
        status: 'queued',
        provider_agent_id: 'cursor_original',
        terminal_at: null,
    });
    expect(await fixture.readAttentions(started.runId)).toHaveLength(1);
    const inspected = agentCloudAgentListReceiptSchema.parse(
        await (
            await fetch(
                new URL(`/api/agent/cloud-agents?workId=${started.work.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).json()
    );
    expect(inspected.works).toHaveLength(1);
    expect(inspected.works[0]?.runs.map((run) => run.runId)).toEqual([
        second.runId,
        first.runId,
        started.runId,
    ]);
    // A follow-up queued behind a finished Run leaves the job done, not queued.
    expect(inspected.works[0]?.job).toEqual({
        followUp: { since: inspected.works[0]?.runs[0]?.createdAt, state: 'waiting' },
        settledAt: '2026-09-06T12:01:00.000Z',
        startedAt: '2026-09-06T12:00:00.000Z',
        state: 'done',
    });
    socket.close();
});

test('an older Run still reporting behind a queued follow-up keeps the work fresh', async () => {
    const runner = await fixture.mintRunner('run_followup_fresh');
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'fresh-start' }))).body
    );
    const socket = await fixture.attachComputer();
    const observeRunning = (observedAt: string, rawStatus: string) =>
        socket.send(
            JSON.stringify({
                type: 'cloud-agent-observation',
                observation: {
                    observedAt,
                    providerAgentId: 'cursor_fresh',
                    rawStatus,
                    runId: started.runId,
                    status: 'running',
                    workId: started.work.id,
                },
            })
        );
    observeRunning(new Date().toISOString(), 'RUNNING');
    await fixture.waitForWorkStatus(started.work.id, 'running');
    expect((await send(runner.token, started.work.id, 'fresh-followup')).ok).toBe(true);
    // Later than the follow-up's own send, so only this observation can explain it.
    const observedAt = new Date(Date.now() + 60_000).toISOString();
    observeRunning(observedAt, 'STILL_RUNNING');
    await fixture.waitFor(
        async () => (await fixture.readRun(started.runId))?.raw_status === 'STILL_RUNNING'
    );
    const listed = agentCloudAgentListReceiptSchema.parse(
        await (
            await fetch(
                new URL(`/api/agent/cloud-agents?workId=${started.work.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).json()
    );
    expect(listed.works[0]).toMatchObject({ status: 'queued', updatedAt: observedAt });
    socket.close();
});

test('send requires delegator identity and its current assigned Computer', async () => {
    const runner = await fixture.mintRunner('run_followup_auth');
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-auth' }))).body
    );
    expect((await send(null, started.work.id, 'no-auth')).status).toBe(401);
    expect((await send(runner.token, started.work.id, 'not-launched')).status).toBe(409);
    const { agent: other } = await fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: 'Other',
        handle: 'other',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
    });
    await fixture.harness
        .sql`update cloud_agent_work set agent_id = ${other.id} where id = ${started.work.id}`;
    expect((await send(runner.token, started.work.id, 'wrong-agent')).status).toBe(404);
    expect(
        (
            await fetch(
                new URL(`/api/agent/cloud-agents?workId=${started.work.id}`, fixture.harness.url),
                { headers: { authorization: `Bearer ${runner.token}` } }
            )
        ).status
    ).toBe(404);
    await fixture.harness
        .sql`update cloud_agent_work set agent_id = ${fixture.orbitAgentId} where id = ${started.work.id}`;
    await fixture.harness
        .sql`update agents set computer_id = null, desired_model_id = null, desired_runtime_id = null where id = ${fixture.orbitAgentId}`;
    expect((await send(runner.token, started.work.id, 'wrong-computer')).status).toBe(404);
    await fixture.harness
        .sql`update agents set computer_id = ${fixture.computerId}, desired_model_id = 'gpt-5.6-sol', desired_runtime_id = 'codex' where id = ${fixture.orbitAgentId}`;
});

function send(token: string | null, workId: string, nonce: string) {
    return fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ workId, nonce }),
    });
}

test('reconnect includes live predecessors beyond the retained card Runs even after current Run settles', async () => {
    const runner = await fixture.mintRunner('run_followup_reconnect');
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-reconnect' }))).body
    );
    await fixture.harness
        .sql`update cloud_agent_work set provider_agent_id = 'cursor_reconnect' where id = ${started.work.id}`;
    const runIds = [started.runId];
    let latest = started.runId;
    for (let index = 0; index < cloudAgentRunsRetained + 1; index += 1) {
        const receipt = agentCloudAgentSendReceiptSchema.parse(
            await (await send(runner.token, started.work.id, `reconnect-${index}`)).json()
        );
        latest = receipt.runId;
        runIds.push(latest);
    }
    expect((await fixture.postCancel(runner, started.work.id)).status).toBe(200);
    await fixture.harness
        .sql`update cloud_agent_runs set status = 'completed', terminal_at = now() where id = ${latest}`;
    await fixture.harness
        .sql`update cloud_agent_work set status = 'completed', terminal_at = now() where id = ${started.work.id}`;
    const socket = new WebSocket(fixture.computerSocketUrl());
    await fixture.opened(socket);
    const reconciled = new Promise<string[]>((resolve) =>
        socket.addEventListener('message', (event) => {
            const parsed = cloudAgentReconcileCommandSchema.safeParse(
                JSON.parse(String(event.data))
            );
            if (parsed.success) {
                resolve(
                    parsed.data.work
                        .filter((run) => run.workId === started.work.id)
                        .map((run) => run.runId)
                );
            }
        })
    );
    socket.send(JSON.stringify(fixture.bootstrapFrame()));
    expect(await reconciled).toEqual(runIds.slice(0, -1));
    socket.close();
    const resumed = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'after-terminal')).json()
    );
    expect(resumed.work.status).toBe('queued');
    expect(resumed.work.terminalAt).toBeNull();
    expect(resumed.work.cancelRequestedAt).toBeNull();
    expect(resumed.work.runs.find((run) => run.runId === latest)?.status).toBe('completed');
});

test('reconnect chunks more than 200 live Runs into valid frames without dropping Runs', async () => {
    const runner = await fixture.mintRunner('run_reconcile_chunks');
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'reconcile-chunks' }))).body
    );
    await fixture.harness.sql`
        insert into cloud_agent_runs (id, server_id, work_id, created_at)
        select 'car_' || lpad(number::text, 16, '0'), ${fixture.serverId}, ${started.work.id},
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
        await sendCloudAgentReconcile(connection.db, connections, {
            id: fixture.computerId,
            serverId: fixture.serverId,
        });
        const parsed = frames.map((frame) => cloudAgentReconcileCommandSchema.parse(frame));
        expect(parsed).toHaveLength(3);
        expect(parsed.slice(0, 2).map((frame) => frame.work.length)).toEqual([200, 200]);
        const runIds = parsed
            .flatMap((frame) => frame.work)
            .filter((run) => run.workId === started.work.id)
            .map((run) => run.runId);
        expect(runIds).toHaveLength(402);
        expect(new Set(runIds).size).toBe(402);
        expect(runIds).toContain(started.runId);
        for (let number = 1; number <= 401; number += 1) {
            expect(runIds).toContain(`car_${String(number).padStart(16, '0')}`);
        }
    } finally {
        connections.unregister(fixture.computerId);
        await connection.close();
    }
});
