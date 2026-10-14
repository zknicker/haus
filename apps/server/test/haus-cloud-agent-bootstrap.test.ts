import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentInputRequestSchema } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();
const questions = [
    {
        header: 'Choice',
        multiSelect: false,
        options: [
            { label: 'alpha', description: 'Use alpha' },
            { label: 'beta', description: 'Use beta' },
        ],
        question: 'Which fixture value should we use?',
    },
];
const answer = { 'Which fixture value should we use?': 'alpha' };

test('native Network Secret bootstrap leases stable work credentials and retains ambiguous continuation dispatch', async () => {
    const bootstrap = randomBytes(32).toString('base64url');
    const registration = await post('/computer/cloud-agents/bootstrap', '', {
        credentialHash: fixture.credentialHash,
        token: bootstrap,
    });
    expect(registration.status).toBe(200);
    expect(
        (
            await post('/computer/cloud-agents/bootstrap-status', '', {
                credentialHash: fixture.credentialHash,
            })
        ).body.verified
    ).toBe(false);
    const artifact = await fetch(new URL('/api/cloud-agents/claude-hooks', fixture.harness.url));
    expect(artifact.status).toBe(200);
    expect(await artifact.text()).toContain('managed-settings.json');
    const sessionId = randomUUID();
    const promptId = randomUUID();
    expect(
        (
            await post('/api/cloud-agents/bootstrap', '', {
                workId: 'caw_untrusted',
                runId: 'car_untrusted',
                sessionId,
                promptId,
            })
        ).status
    ).toBe(409);
    expect(
        (
            await post('/api/cloud-agents/bootstrap/verify', '', {
                sessionId,
                promptId,
                protocolVersion: 1,
                remoteVersion: '2.1.295 (Claude Code)',
            })
        ).status
    ).toBe(409);
    expect(
        (await post('/api/cloud-agents/callback', '', { kind: 'prompt', sessionId, promptId }))
            .status
    ).toBe(401);
    expect(
        (await fetch(new URL('/api/cloud-agents/input/cai_untrusted', fixture.harness.url))).status
    ).toBe(401);
    for (const remoteVersion of ['2.1.282 (Claude Code)', 'invalid']) {
        expect(
            (
                await bootstrapCall('/api/cloud-agents/bootstrap/verify', bootstrap, {
                    sessionId,
                    promptId,
                    protocolVersion: 1,
                    remoteVersion,
                })
            ).status
        ).toBe(409);
    }
    expect(
        (
            await post('/computer/cloud-agents/bootstrap-status', '', {
                credentialHash: fixture.credentialHash,
            })
        ).body.verified
    ).toBe(false);
    expect(
        (
            await bootstrapCall('/api/cloud-agents/bootstrap/verify', bootstrap, {
                sessionId,
                promptId,
                protocolVersion: 1,
                remoteVersion: '2.1.295 (Claude Code)',
            })
        ).status
    ).toBe(200);
    expect(
        (
            await post('/computer/cloud-agents/bootstrap-status', '', {
                credentialHash: fixture.credentialHash,
            })
        ).body.verified
    ).toBe(true);
    const runner = await fixture.mintRunner('input-bootstrap');
    const created = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'input-bootstrap', provider: 'claude' })
    );
    const workId = created.body.work?.id;
    const runId = created.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const lease = { workId, runId, sessionId, promptId };
    const first = await bootstrapCall('/api/cloud-agents/bootstrap', bootstrap, lease);
    const second = await bootstrapCall('/api/cloud-agents/bootstrap', bootstrap, lease);
    expect(first.status).toBe(200);
    expect(second.body.token).toBe(first.body.token);
    const nativeToken = String(first.body.token);
    expect(nativeToken).not.toBe(bootstrap);
    const question = await callback(nativeToken, {
        kind: 'question',
        sessionId,
        promptId,
        toolUseId: 'bootstrap-question',
        questions,
    });
    const input = cloudAgentInputRequestSchema.parse(question.body.request);
    await post('/api/agent/cloud-agents/input/answer', runner.token, { id: input.id, answer });
    expect(
        (
            await post('/computer/cloud-agents/continue', '', {
                credentialHash: fixture.credentialHash,
                requestId: input.id,
            })
        ).status
    ).toBe(409);
    await fixture.harness
        .sql`update cloud_agent_work set provider_agent_id='session_hosted_real_fixture' where id=${workId}`;
    const claim = await post('/computer/cloud-agents/continue', '', {
        credentialHash: fixture.credentialHash,
        requestId: input.id,
    });
    expect(claim.body).toMatchObject({
        claimed: true,
        providerAgentId: 'session_hosted_real_fixture',
        requestId: input.id,
    });
    expect(
        (
            await post('/computer/cloud-agents/continue', '', {
                credentialHash: fixture.credentialHash,
                requestId: input.id,
            })
        ).body.claimed
    ).toBe(false);
    const before = await post('/computer/cloud-agents/read', '', {
        credentialHash: fixture.credentialHash,
        workId,
        runId,
    });
    expect(before.body.continuations[0].state).toBe('sending');
    expect(JSON.stringify(before.body)).not.toContain(nativeToken);
    expect(JSON.stringify(before.body)).not.toContain(bootstrap);
    expect(
        (
            await bootstrapCall('/api/cloud-agents/bootstrap', bootstrap, {
                ...lease,
                promptId: randomUUID(),
                requestId: input.id,
            })
        ).status
    ).toBe(200);
    const after = await post('/computer/cloud-agents/read', '', {
        credentialHash: fixture.credentialHash,
        workId,
        runId,
    });
    expect(after.body.continuations[0].state).toBe('accepted');
    expect((await fixture.readWork(workId))?.status).toBe('pending_input');
    expect(
        (
            await post('/computer/cloud-agents/read', '', {
                credentialHash: '0'.repeat(64),
                workId,
                runId,
            })
        ).status
    ).toBe(409);
    expect(
        (
            await post('/computer/cloud-agents/bootstrap-revoke', '', {
                credentialHash: fixture.credentialHash,
            })
        ).status
    ).toBe(200);
    expect(
        (
            await post('/computer/cloud-agents/bootstrap-status', '', {
                credentialHash: fixture.credentialHash,
            })
        ).body.verified
    ).toBe(false);
    expect((await bootstrapCall('/api/cloud-agents/bootstrap', bootstrap, lease)).status).toBe(409);
    expect((await callback(nativeToken, { kind: 'prompt', sessionId, promptId })).status).toBe(200);
});

async function bootstrapCall(path: string, token: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        method: 'POST',
        headers: {
            'x-haus-cloud-bootstrap': token,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
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
