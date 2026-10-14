import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('native schedule evidence survives Server restart, stays unknown when omitted, and resets on a newer prompt', async () => {
    const runner = await fixture.mintRunner('native-schedule-evidence');
    const start = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'native-schedule-evidence', provider: 'claude' })
    );
    const workId = start.body.work?.id;
    const runId = start.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const token = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const promptId = randomUUID();
    expect(
        (
            await post('/api/agent/cloud-agents/callback-credential', runner.token, {
                workId,
                runId,
                token,
            })
        ).status
    ).toBe(200);
    await callback(token, { kind: 'prompt', sessionId, promptId });
    const initial = await snapshot(workId, runId);
    expect(initial.stopEvidence).toBeNull();
    const stop = {
        kind: 'stop',
        sessionId,
        promptId,
        backgroundTasks: 0,
        lastAssistantMessage: 'Paused response',
    };
    expect((await callback(token, stop)).body.settled).toBe(false);
    expect((await snapshot(workId, runId)).stopEvidence).toMatchObject({
        promptId,
        sessionCrons: null,
        backgroundTasks: 0,
    });
    expect((await callback(token, { ...stop, sessionCrons: 1 })).body.settled).toBe(false);
    await fixture.harness.restart();
    expect((await snapshot(workId, runId)).stopEvidence).toMatchObject({
        promptId,
        sessionCrons: 1,
    });
    const newer = randomUUID();
    await callback(token, { kind: 'prompt', sessionId, promptId: newer });
    expect((await snapshot(workId, runId)).stopEvidence).toBeNull();
    await callback(token, { ...stop, sessionCrons: 1 });
    expect((await snapshot(workId, runId)).stopEvidence).toBeNull();
    expect(
        (await callback(token, { ...stop, promptId: newer, sessionCrons: 0 })).body.settled
    ).toBe(true);
    expect((await snapshot(workId, runId)).stopEvidence).toMatchObject({
        promptId: newer,
        sessionCrons: 0,
    });
});

async function snapshot(workId: string, runId: string) {
    return (
        await post('/computer/cloud-agents/read', '', {
            credentialHash: fixture.credentialHash,
            workId,
            runId,
        })
    ).body;
}
function callback(token: string, body: unknown) {
    return post('/api/cloud-agents/callback', token, body);
}
async function post(path: string, token: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        method: 'POST',
        headers: {
            ...(path.startsWith('/api/cloud-agents/')
                ? { 'x-haus-cloud-run': token }
                : { authorization: `Bearer ${token}` }),
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}
