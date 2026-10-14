import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('the cancellation scope retains an active native Run and its schedules beneath twenty-one queued Runs', async () => {
    const runner = await fixture.mintRunner('claude-full-cancellation-scope');
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'claude-full-cancellation-scope', provider: 'claude' })
    );
    const workId = started.body.work?.id;
    const runId = started.body.runId;
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
    expect(
        (await post('/api/cloud-agents/callback', token, { kind: 'prompt', sessionId, promptId }))
            .status
    ).toBe(200);
    const paused = await post('/api/cloud-agents/callback', token, {
        kind: 'stop',
        sessionId,
        promptId,
        backgroundTasks: 1,
        sessionCrons: 1,
        lastAssistantMessage: 'A scheduled wake remains',
    });
    expect(paused.body.settled).toBe(false);
    await fixture.harness
        .sql`update cloud_agent_work set provider_agent_id='session_fullScope' where id=${workId}`;
    const ids = [runId];
    for (let index = 0; index < 21; index++) {
        const queued = await post('/api/agent/cloud-agents/send', runner.token, {
            workId,
            nonce: `queued-scope-${index}`,
        });
        expect(queued.status).toBe(200);
        ids.push(String(queued.body.runId));
    }
    expect((await fixture.postCancel(runner, workId)).status).toBe(200);
    const latestId = ids.at(-1);
    const queued = await read(workId, latestId);
    expect(queued.work.runs).toHaveLength(20);
    expect(queued.work.runs.some((run: { runId: string }) => run.runId === runId)).toBe(false);
    expect(queued.prompts).toEqual([]);
    expect(queued.stopEvidence).toBeNull();
    expect(queued.cancellation.activeRunId).toBe(runId);
    expect(queued.cancellation.runIds).toHaveLength(22);
    expect(new Set(queued.cancellation.runIds)).toEqual(new Set(ids));
    const [canonical] = await fixture.harness
        .sql`select count(*)::int as count from cloud_agent_runs where work_id=${workId} and status in ('queued','running','pending_input')`;
    expect(queued.cancellation.runIds.length).toBe(canonical.count);
    const active = await read(workId, queued.cancellation.activeRunId);
    expect(active.run.runId).toBe(runId);
    expect(active.prompts[0].promptId).toBe(promptId);
    expect(active.stopEvidence).toMatchObject({ promptId, sessionCrons: 1 });
});

async function read(workId: string, runId?: string) {
    return (
        await post('/computer/cloud-agents/read', '', {
            credentialHash: fixture.credentialHash,
            workId,
            runId,
        })
    ).body;
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
