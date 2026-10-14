import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('native execution acceptance cannot regress to a late CLI queued receipt', async () => {
    const probe = await admitted('native-before-cli');
    await callback(probe.token, {
        kind: 'prompt',
        sessionId: probe.sessionId,
        promptId: probe.promptId,
    });
    const socket = await fixture.attachComputer();
    try {
        sendReceipt(socket, probe, 'session_nativeAccepted');
        await fixture.waitFor(
            async () =>
                (await fixture.readWork(probe.workId))?.provider_agent_id ===
                    'session_nativeAccepted' || null
        );
        expect((await fixture.readWork(probe.workId))?.status).toBe('running');
        expect((await fixture.readRun(probe.runId))?.status).toBe('running');
    } finally {
        socket.close();
    }
});

test('native completion before the CLI returns retains the hosted address without changing outcome or notifying twice', async () => {
    const probe = await admitted('native-complete-before-cli');
    await callback(probe.token, {
        kind: 'prompt',
        sessionId: probe.sessionId,
        promptId: probe.promptId,
    });
    expect(
        (
            await callback(probe.token, {
                kind: 'stop',
                sessionId: probe.sessionId,
                promptId: probe.promptId,
                backgroundTasks: 0,
                lastAssistantMessage: 'Verified result',
            })
        ).body.settled
    ).toBe(true);
    const socket = await fixture.attachComputer();
    try {
        sendReceipt(socket, probe, 'session_nativeCompleted');
        await fixture.waitFor(
            async () =>
                (await fixture.readWork(probe.workId))?.provider_agent_id ===
                    'session_nativeCompleted' || null
        );
        expect(await fixture.readWork(probe.workId)).toMatchObject({
            status: 'completed',
            provider_agent_id: 'session_nativeCompleted',
            provider_url: 'https://claude.ai/code/session_nativeCompleted',
        });
        expect((await fixture.readAttentions(probe.runId)).length).toBe(1);
    } finally {
        socket.close();
    }
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
    expect(
        (
            await post('/api/agent/cloud-agents/callback-credential', runner.token, {
                workId,
                runId,
                token,
            })
        ).status
    ).toBe(200);
    return { workId, runId, token, sessionId: randomUUID(), promptId: randomUUID() };
}

test('native completion survives deletion of its requesting conversation without retargeting the inbox attention', async () => {
    const probe = await admitted('native-deleted-request');
    await callback(probe.token, {
        kind: 'prompt',
        sessionId: probe.sessionId,
        promptId: probe.promptId,
    });
    await fixture.harness
        .sql`update chats set deleted_at=now(), deleted_by_user_id=${fixture.ownerUserId} where id=${fixture.channelId}`;
    try {
        const settled = await callback(probe.token, {
            kind: 'stop',
            sessionId: probe.sessionId,
            promptId: probe.promptId,
            backgroundTasks: 0,
            lastAssistantMessage: 'Finished after conversation deletion',
        });
        expect(settled.status).toBe(200);
        expect(settled.body.settled).toBe(true);
        expect((await fixture.readWork(probe.workId))?.status).toBe('completed');
        expect((await fixture.readAttentions(probe.runId)).length).toBe(0);
    } finally {
        await fixture.harness
            .sql`update chats set deleted_at=null, deleted_by_user_id=null where id=${fixture.channelId}`;
    }
});
function sendReceipt(
    socket: WebSocket,
    probe: { workId: string; runId: string },
    providerAgentId: string
) {
    socket.send(
        JSON.stringify({
            type: 'cloud-agent-observation',
            observation: {
                workId: probe.workId,
                runId: probe.runId,
                status: 'queued',
                observedAt: new Date().toISOString(),
                providerAgentId,
                providerUrl: `https://claude.ai/code/${providerAgentId}`,
            },
        })
    );
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
