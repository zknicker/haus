import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('a definitive cancellation before native launch settles without an interrupt receipt', async () => {
    const runner = await fixture.mintRunner('claude-stop-before-native-launch');
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-stop-before-native-launch', provider: 'claude' })
    );
    const workId = started.body.work?.id;
    const runId = started.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const socket = await fixture.attachComputer();
    try {
        expect((await fixture.postCancel(runner, workId)).status).toBe(200);
        observe(socket, { workId, runId, status: 'cancelled', rawStatus: 'NOT_LAUNCHED' });
        await fixture.waitForWorkStatus(workId, 'cancelled');
        expect((await fixture.readRun(runId))?.status).toBe('cancelled');
        expect((await fixture.readWork(workId))?.provider_agent_id).toBeNull();
        expect((await fixture.readAttentions(runId)).length).toBe(1);
    } finally {
        socket.close();
    }
});

test('a failed queued launch cannot reopen follow-ups while the accepted Claude execution is still stopping', async () => {
    const runner = await fixture.mintRunner('claude-stop-late-queue-failure');
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-stop-late-queue-failure', provider: 'claude' })
    );
    const workId = started.body.work?.id;
    const runId = started.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const socket = await fixture.attachComputer();
    try {
        observe(socket, {
            workId,
            runId,
            providerRunId: randomUUID(),
            providerAgentId: 'session_stopRace',
            providerUrl: 'https://claude.ai/code/session_stopRace',
            status: 'running',
        });
        await fixture.waitForWorkStatus(workId, 'running');
        const queued = await send(runner.token, workId, 'queued-before-stop');
        expect(queued.status).toBe(200);
        expect((await fixture.postCancel(runner, workId)).status).toBe(200);
        observe(socket, {
            workId,
            runId: String(queued.body.runId),
            status: 'failed',
            errorCode: 'launch-refused',
        });
        await fixture.waitForWorkStatus(workId, 'failed');
        expect((await fixture.readRun(runId))?.status).toBe('running');
        expect((await send(runner.token, workId, 'unsafe-followup')).status).toBe(409);
        observe(socket, { workId, runId, status: 'cancelled', rawStatus: 'INTERRUPTED' });
        await fixture.waitForWorkStatus(workId, 'cancelled');
        expect((await send(runner.token, workId, 'safe-followup')).status).toBe(200);
    } finally {
        socket.close();
    }
});

function observe(socket: WebSocket, observation: Record<string, string>) {
    socket.send(
        JSON.stringify({
            type: 'cloud-agent-observation',
            observation: { ...observation, observedAt: new Date().toISOString() },
        })
    );
}
async function send(token: string, workId: string, nonce: string) {
    const response = await fetch(new URL('/api/agent/cloud-agents/send', fixture.harness.url), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ workId, nonce }),
    });
    return { status: response.status, body: await response.json() };
}
