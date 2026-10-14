import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentInputRequestSchema } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();
const questions = [
    {
        header: 'Choice',
        multiSelect: false,
        question: 'Which value?',
        options: [
            { label: 'alpha', description: 'Use alpha' },
            { label: 'beta', description: 'Use beta' },
        ],
    },
];

test('only the owning Agent can stop Claude, and confirmed interruption cancels the entire frozen queue once', async () => {
    const probe = await admitted('claude-stop-fenced');
    const socket = await fixture.attachComputer();
    try {
        socket.send(
            JSON.stringify({
                type: 'cloud-agent-observation',
                observation: {
                    workId: probe.workId,
                    runId: probe.runId,
                    providerAgentId: 'session_stopFixture',
                    providerUrl: 'https://claude.ai/code/session_stopFixture',
                    status: 'running',
                    observedAt: new Date().toISOString(),
                },
            })
        );
        await fixture.waitFor(
            async () =>
                (await fixture.readWork(probe.workId))?.provider_agent_id ===
                    'session_stopFixture' || null
        );
        const question = await callback(probe.token, {
            kind: 'question',
            sessionId: probe.sessionId,
            promptId: probe.promptId,
            toolUseId: 'stop-question',
            questions,
        });
        const request = cloudAgentInputRequestSchema.parse(question.body.request);
        expect(
            (
                await post('/api/agent/cloud-agents/input/answer', probe.runner.token, {
                    id: request.id,
                    answer: { 'Which value?': 'alpha' },
                })
            ).status
        ).toBe(200);
        const first = await post('/api/agent/cloud-agents/send', probe.runner.token, {
            workId: probe.workId,
            nonce: 'queued-one',
        });
        const second = await post('/api/agent/cloud-agents/send', probe.runner.token, {
            workId: probe.workId,
            nonce: 'queued-two',
        });
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        await expect(
            fixture.owner.trpc.cloudAgentWork.cancel.mutate({
                serverId: fixture.serverId,
                workId: probe.workId,
            })
        ).rejects.toThrow('Claude Cloud cancellation');
        const foreign = await anotherAgentRunner();
        expect((await fixture.postCancel(foreign, probe.workId)).status).toBe(403);
        expect((await fixture.postCancel(probe.runner, probe.workId)).status).toBe(200);
        const [stopping] = await fixture.harness
            .sql`select cancel_requested_at from cloud_agent_work where id=${probe.workId}`;
        expect(stopping.cancel_requested_at).toBeInstanceOf(Date);
        expect(
            (
                await post('/api/agent/cloud-agents/input/answer', probe.runner.token, {
                    id: request.id,
                    answer: { 'Which value?': 'alpha' },
                })
            ).status
        ).toBe(409);
        expect(
            (
                await post('/computer/cloud-agents/continue', '', {
                    credentialHash: fixture.credentialHash,
                    requestId: request.id,
                })
            ).status
        ).toBe(409);
        expect(
            (
                await callback(probe.token, {
                    kind: 'consume',
                    sessionId: probe.sessionId,
                    promptId: probe.promptId,
                    toolUseId: 'stop-question',
                    id: request.id,
                    answer: { 'Which value?': 'alpha' },
                })
            ).status
        ).toBe(409);
        expect(
            (
                await callback(probe.token, {
                    kind: 'stop',
                    sessionId: probe.sessionId,
                    promptId: probe.promptId,
                    backgroundTasks: 0,
                    lastAssistantMessage: 'Interrupted response',
                })
            ).body.settled
        ).toBe(false);
        expect(
            (
                await post('/api/agent/cloud-agents/send', probe.runner.token, {
                    workId: probe.workId,
                    nonce: 'too-early-followup',
                })
            ).status
        ).toBe(409);
        const [invalidated] = await fixture.harness
            .sql`select state from cloud_agent_input where id=${request.id}`;
        expect(invalidated.state).toBe('cancelled');
        socket.send(
            JSON.stringify({
                type: 'cloud-agent-observation',
                observation: {
                    workId: probe.workId,
                    runId: String(second.body.runId),
                    status: 'cancelled',
                    observedAt: new Date().toISOString(),
                },
            })
        );
        await Bun.sleep(40);
        expect((await fixture.readRun(probe.runId))?.status).toBe('running');
        expect((await fixture.readRun(String(second.body.runId)))?.status).toBe('queued');
        socket.send(
            JSON.stringify({
                type: 'cloud-agent-observation',
                observation: {
                    workId: probe.workId,
                    runId: String(second.body.runId),
                    status: 'cancelled',
                    rawStatus: 'NOT_LAUNCHED',
                    observedAt: new Date().toISOString(),
                },
            })
        );
        await Bun.sleep(40);
        expect((await fixture.readRun(probe.runId))?.status).toBe('running');
        expect((await fixture.readRun(String(second.body.runId)))?.status).toBe('queued');
        const observation = {
            workId: probe.workId,
            runId: probe.runId,
            status: 'cancelled',
            rawStatus: 'INTERRUPTED',
            observedAt: new Date(Date.now() - 60_000).toISOString(),
        };
        socket.send(JSON.stringify({ type: 'cloud-agent-observation', observation }));
        await fixture.waitForWorkStatus(probe.workId, 'cancelled');
        const ids = [probe.runId, String(first.body.runId), String(second.body.runId)];
        for (const id of ids) {
            expect((await fixture.readRun(id))?.status).toBe('cancelled');
            expect((await fixture.readAttentions(id)).length).toBe(1);
        }
        socket.send(JSON.stringify({ type: 'cloud-agent-observation', observation }));
        expect(
            (
                await callback(probe.token, {
                    kind: 'stop',
                    sessionId: probe.sessionId,
                    promptId: probe.promptId,
                    backgroundTasks: 0,
                    lastAssistantMessage: 'Late Stop',
                })
            ).body.settled
        ).toBe(true);
        expect((await fixture.readWork(probe.workId))?.status).toBe('cancelled');
        const resumed = await post('/api/agent/cloud-agents/send', probe.runner.token, {
            workId: probe.workId,
            nonce: 'after-confirmed-stop',
        });
        expect(resumed.status).toBe(200);
        expect(resumed.body.work.providerAgentId).toBe('session_stopFixture');
        expect(resumed.body.runId).not.toBe(probe.runId);
        for (const id of ids) {
            expect((await fixture.readAttentions(id)).length).toBe(1);
        }
    } finally {
        socket.close();
    }
});

test('an old native completion cannot overwrite a newer queued Run projection', async () => {
    const probe = await admitted('claude-old-native-stop');
    await fixture.harness
        .sql`update cloud_agent_work set provider_agent_id='session_oldPrompt' where id=${probe.workId}`;
    const next = await post('/api/agent/cloud-agents/send', probe.runner.token, {
        workId: probe.workId,
        nonce: 'next-native-run',
    });
    expect(next.status).toBe(200);
    expect(
        (
            await callback(probe.token, {
                kind: 'stop',
                sessionId: probe.sessionId,
                promptId: probe.promptId,
                backgroundTasks: 0,
                lastAssistantMessage: 'Old turn finished',
            })
        ).body.settled
    ).toBe(true);
    expect((await fixture.readRun(probe.runId))?.status).toBe('completed');
    expect((await fixture.readWork(probe.workId))?.status).toBe('queued');
});

async function admitted(nonce: string) {
    const runner = await fixture.mintRunner(nonce);
    const start = await fixture.postStart(runner, fixture.startBody({ nonce, provider: 'claude' }));
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
    expect((await callback(token, { kind: 'prompt', sessionId, promptId })).status).toBe(200);
    return { runner, workId, runId, token, sessionId, promptId };
}
async function anotherAgentRunner() {
    const { agent } = await fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: 'Other',
        handle: 'other-stop',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
    });
    const response = await fetch(new URL('/computer/runner/mint', fixture.harness.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            agentId: agent.id,
            chatId: fixture.channelId,
            credentialHash: fixture.credentialHash,
            runId: 'other-stop-run',
        }),
    });
    const result = await response.json();
    return { token: String(result.runnerToken) };
}
function callback(token: string, body: Record<string, unknown>) {
    return post(
        '/api/cloud-agents/callback',
        token,
        body.kind === 'stop' ? { sessionCrons: 0, ...body } : body
    );
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
