import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { cloudAgentInputRequestSchema } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('the native run header authenticates only its exact execution, while Bearer remains Agent-only', async () => {
    const first = await admitted('native-header-first');
    const native = { kind: 'prompt', sessionId: randomUUID(), promptId: randomUUID() };
    expect(
        (
            await post(
                '/api/cloud-agents/callback',
                {
                    'x-haus-cloud-run': first.token,
                    'x-haus-cloud-bootstrap': 'proxy-injected-header',
                },
                native
            )
        ).status
    ).toBe(200);
    expect(
        (
            await post(
                '/api/cloud-agents/callback',
                { authorization: `Bearer ${first.token}` },
                native
            )
        ).status
    ).toBe(401);
    expect(
        (
            await post(
                '/api/cloud-agents/callback',
                { 'x-haus-cloud-run': randomBytes(32).toString('base64url') },
                native
            )
        ).status
    ).toBe(401);
    const created = await post(
        '/api/cloud-agents/callback',
        { 'x-haus-cloud-run': first.token },
        {
            ...native,
            kind: 'question',
            toolUseId: 'native-header-question',
            questions: [
                {
                    header: 'Choice',
                    multiSelect: false,
                    question: 'Which value?',
                    options: [
                        { label: 'alpha', description: 'Use alpha' },
                        { label: 'beta', description: 'Use beta' },
                    ],
                },
            ],
        }
    );
    const input = cloudAgentInputRequestSchema.parse(created.body.request);
    expect(
        (
            await fetch(new URL(`/api/cloud-agents/input/${input.id}`, fixture.harness.url), {
                headers: { 'x-haus-cloud-run': first.token },
            })
        ).status
    ).toBe(200);
    expect(
        (
            await fetch(new URL(`/api/cloud-agents/input/${input.id}`, fixture.harness.url), {
                headers: { authorization: `Bearer ${first.token}` },
            })
        ).status
    ).toBe(401);
    const second = await admitted('native-header-second');
    expect(
        (
            await fetch(new URL(`/api/cloud-agents/input/${input.id}`, fixture.harness.url), {
                headers: { 'x-haus-cloud-run': second.token },
            })
        ).status
    ).toBe(409);
    expect(
        (
            await post(
                '/api/agent/cloud-agents/input/answer',
                { 'x-haus-cloud-run': first.runner.token },
                { id: input.id, answer: { 'Which value?': 'alpha' } }
            )
        ).status
    ).toBe(401);
    expect(
        (
            await post(
                '/api/agent/cloud-agents/input/answer',
                { authorization: `Bearer ${first.runner.token}` },
                { id: input.id, answer: { 'Which value?': 'alpha' } }
            )
        ).status
    ).toBe(200);
});

async function admitted(nonce: string) {
    const runner = await fixture.mintRunner(nonce);
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce, provider: 'claude' })
    );
    const workId = started.body.work?.id;
    const runId = started.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const token = randomBytes(32).toString('base64url');
    expect(
        (
            await post(
                '/api/agent/cloud-agents/callback-credential',
                { authorization: `Bearer ${runner.token}` },
                { workId, runId, token }
            )
        ).status
    ).toBe(200);
    return { runner, token };
}
async function post(path: string, headers: Record<string, string>, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
}
