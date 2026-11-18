import { expect, test } from 'bun:test';
import {
    agentCloudAgentListReceiptSchema,
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    type CloudAgentObservation,
} from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('the job mirrors Cursor for the newest Run Cursor received, not a follow-up Haus still held', async () => {
    const runner = await fixture.mintRunner('run_followup_cancel');
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce: 'followup-cancel' }))).body
    );
    const socket = await fixture.attachComputer();
    const observe = async (observation: CloudAgentObservation) => {
        socket.send(JSON.stringify({ type: 'cloud-agent-observation', observation }));
        await fixture.waitFor(
            async () => (await fixture.readRun(observation.runId))?.status === observation.status
        );
    };
    await observe({
        observedAt: '2026-09-06T12:00:00.000Z',
        providerAgentId: 'cursor_cancel',
        providerRunId: 'cursor_cancel_first',
        runId: started.runId,
        status: 'running',
        workId: started.work.id,
    });
    await observe({
        observedAt: '2026-09-06T12:01:00.000Z',
        runId: started.runId,
        status: 'completed',
        workId: started.work.id,
    });

    // Cancelled while still in the Computer's local queue: Cursor never received it.
    const held = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'held-followup')).json()
    );
    await observe({
        observedAt: '2026-09-06T12:02:00.000Z',
        runId: held.runId,
        status: 'cancelled',
        workId: started.work.id,
    });
    expect(await job(runner.token, started.work.id)).toEqual({
        followUp: null,
        settledAt: '2026-09-06T12:01:00.000Z',
        startedAt: '2026-09-06T12:00:00.000Z',
        state: 'done',
    });

    // Cancelled after Cursor received it: Cursor's CANCELLED is the job.
    const delivered = agentCloudAgentSendReceiptSchema.parse(
        await (await send(runner.token, started.work.id, 'delivered-followup')).json()
    );
    await observe({
        observedAt: '2026-09-06T12:03:00.000Z',
        providerRunId: 'cursor_cancel_second',
        runId: delivered.runId,
        status: 'running',
        workId: started.work.id,
    });
    await observe({
        observedAt: '2026-09-06T12:04:00.000Z',
        runId: delivered.runId,
        status: 'cancelled',
        workId: started.work.id,
    });
    expect(await job(runner.token, started.work.id)).toMatchObject({
        followUp: null,
        state: 'cancelled',
    });
    socket.close();
});

async function job(token: string, workId: string) {
    const listed = agentCloudAgentListReceiptSchema.parse(
        await (
            await fetch(new URL(`/api/agent/cloud-agents?workId=${workId}`, fixture.harness.url), {
                headers: { authorization: `Bearer ${token}` },
            })
        ).json()
    );
    return listed.works[0]?.job;
}

function send(token: string, workId: string, nonce: string) {
    return fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ workId, nonce }),
    });
}
