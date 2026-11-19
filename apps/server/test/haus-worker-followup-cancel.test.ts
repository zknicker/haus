import { expect, test } from 'bun:test';
import {
    agentWorkerListReceiptSchema,
    agentWorkerReceiptSchema,
    agentWorkerSendReceiptSchema,
    type WorkerObservation,
} from '@haus/api';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();

test('the job mirrors Cursor for the newest Run Cursor received, not a follow-up Haus still held', async () => {
    const runner = await fixture.mintRunner('run_followup_cancel');
    const started = agentWorkerReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-cancel' }))).body
    );
    const socket = await fixture.attachComputer();
    const observe = async (observation: WorkerObservation) => {
        socket.send(JSON.stringify({ type: 'worker-observation', observation }));
        await fixture.waitFor(
            async () => (await fixture.readRun(observation.turnId))?.status === observation.status
        );
    };
    await observe({
        observedAt: '2026-09-06T12:00:00.000Z',
        providerAgentId: 'cursor_cancel',
        providerRunId: 'cursor_cancel_first',
        turnId: started.turnId,
        status: 'running',
        workerId: started.worker.id,
    });
    await observe({
        observedAt: '2026-09-06T12:01:00.000Z',
        turnId: started.turnId,
        status: 'completed',
        workerId: started.worker.id,
    });

    // Cancelled while still in the Computer's local queue: Cursor never received it.
    const held = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'held-followup')).json()
    );
    await observe({
        observedAt: '2026-09-06T12:02:00.000Z',
        turnId: held.turnId,
        status: 'cancelled',
        workerId: started.worker.id,
    });
    expect(await job(runner.token, started.worker.id)).toEqual({
        followUp: null,
        settledAt: '2026-09-06T12:01:00.000Z',
        startedAt: '2026-09-06T12:00:00.000Z',
        state: 'done',
    });

    // Cancelled after Cursor received it: Cursor's CANCELLED is the job.
    const delivered = agentWorkerSendReceiptSchema.parse(
        await (await send(runner.token, started.worker.id, 'delivered-followup')).json()
    );
    await observe({
        observedAt: '2026-09-06T12:03:00.000Z',
        providerRunId: 'cursor_cancel_second',
        turnId: delivered.turnId,
        status: 'running',
        workerId: started.worker.id,
    });
    await observe({
        observedAt: '2026-09-06T12:04:00.000Z',
        turnId: delivered.turnId,
        status: 'cancelled',
        workerId: started.worker.id,
    });
    expect(await job(runner.token, started.worker.id)).toMatchObject({
        followUp: null,
        state: 'cancelled',
    });
    socket.close();
});

async function job(token: string, workerId: string) {
    const listed = agentWorkerListReceiptSchema.parse(
        await (
            await fetch(new URL(`/api/agent/workers?workerId=${workerId}`, fixture.harness.url), {
                headers: { authorization: `Bearer ${token}` },
            })
        ).json()
    );
    return listed.workers[0]?.job;
}

function send(token: string, workerId: string, nonce: string) {
    return fetch(new URL('/api/agent/workers/send', fixture.harness.url), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ workerId, nonce }),
    });
}
