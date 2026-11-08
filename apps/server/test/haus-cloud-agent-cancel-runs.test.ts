import { expect, test } from 'bun:test';
import {
    agentCloudAgentReceiptSchema,
    agentCloudAgentSendReceiptSchema,
    type CloudAgentObservation,
} from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

async function startWithFollowUp(nonce: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    const started = agentCloudAgentReceiptSchema.parse(
        (await fixture.postStart(runner, fixture.startBody({ nonce }))).body
    );
    const socket = await fixture.attachComputer();
    const observation: CloudAgentObservation = {
        observedAt: '2026-11-05T12:00:00.000Z',
        providerAgentId: `cursor_${nonce}`,
        providerRunId: `cursor_${nonce}_first`,
        runId: started.runId,
        status: 'running',
        workId: started.work.id,
    };
    socket.send(JSON.stringify({ observation, type: 'cloud-agent-observation' }));
    await fixture.waitFor(async () => (await fixture.readRun(started.runId))?.status === 'running');
    const followUp = await send(runner.token, started.work.id, `${nonce}-followup`);
    return { followUp, runner, socket, started };
}

test('a cancel reaches every live Run, not only the newest', async () => {
    const { followUp, runner, socket, started } = await startWithFollowUp('cancel-all');
    const frames: { runId?: string; type?: string }[] = [];
    socket.addEventListener('message', (event) => {
        frames.push(JSON.parse(String(event.data)));
    });

    expect((await fixture.postCancel(runner, started.work.id)).status).toBe(200);

    expect((await fixture.readRun(started.runId))?.cancel_requested_at).not.toBeNull();
    expect((await fixture.readRun(followUp.runId))?.cancel_requested_at).not.toBeNull();
    await fixture.waitFor(() =>
        Promise.resolve(frames.filter((frame) => frame.type === 'cloud-agent-cancel').length === 2)
    );
    expect(
        frames
            .filter((frame) => frame.type === 'cloud-agent-cancel')
            .map((frame) => frame.runId)
            .sort()
    ).toEqual([started.runId, followUp.runId].sort());
    socket.close();
});

test('a follow-up after a cancel leaves the running predecessor cancelling', async () => {
    const { followUp, runner, socket, started } = await startWithFollowUp('cancel-then-send');
    expect((await fixture.postCancel(runner, started.work.id)).status).toBe(200);

    const next = await send(runner.token, started.work.id, 'cancel-then-send-next');

    expect((await fixture.readRun(started.runId))?.cancel_requested_at).not.toBeNull();
    expect((await fixture.readRun(followUp.runId))?.cancel_requested_at).not.toBeNull();
    expect((await fixture.readRun(next.runId))?.cancel_requested_at).toBeNull();
    socket.close();
});

async function send(token: string, workId: string, nonce: string) {
    const response = await fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        body: JSON.stringify({ nonce, workId }),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return agentCloudAgentSendReceiptSchema.parse(await response.json());
}
