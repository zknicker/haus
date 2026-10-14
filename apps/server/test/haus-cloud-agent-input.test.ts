import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { agentInboxItemSchema, cloudAgentInputRequestSchema } from '@haus/api';
import { buildInboxItems } from '../src/agent-delivery/inbox-items.ts';
import { listQueuedItems } from '../src/agent-delivery/store.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
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

test('native question persists once, survives restart, and resolves only after an exact native consumption', async () => {
    const runner = await fixture.mintRunner('input-delegation');
    const start = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'input-delayed', provider: 'claude' })
    );
    expect(start.status).toBe(200);
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
        (
            await post('/api/agent/cloud-agents/callback-credential', runner.token, {
                workId,
                runId,
                token: randomBytes(32).toString('base64url'),
            })
        ).status
    ).toBe(409);
    const sessionId = randomUUID();
    const promptId = randomUUID();
    expect((await callback(token, { kind: 'prompt', sessionId, promptId })).status).toBe(200);
    const question = {
        kind: 'question',
        sessionId,
        promptId,
        toolUseId: 'question-original',
        questions,
    };
    const registered = await callback(token, question);
    expect(registered.status).toBe(200);
    const input = cloudAgentInputRequestSchema.parse(registered.body.request);
    expect(input.state).toBe('pending');
    expect((await callback(token, question)).status).toBe(200);
    expect(
        (
            await callback(token, {
                ...question,
                questions: [{ ...questions[0], question: 'Changed question' }],
            })
        ).status
    ).toBe(409);
    const [counts] = await fixture.harness
        .sql`select count(*)::int as count from agent_inbox where source='cloud_agent_input' and dedupe_key=${input.id}`;
    expect(counts.count).toBe(1);
    const connection = await connectHausDatabase(fixture.harness.databaseUrl);
    try {
        const rows = await listQueuedItems(connection.db, fixture.orbitAgentId, 100);
        const envelopes = await buildInboxItems(connection.db, rows);
        const envelope = envelopes.find((entry) => entry.id === input.id);
        expect(agentInboxItemSchema.parse(envelope)).toMatchObject({
            id: input.id,
            sequence: 0,
            senderType: 'system',
            cloudAgentInput: { request: { id: input.id, questions } },
        });
    } finally {
        await connection.close();
    }
    expect((await fixture.readWork(workId))?.status).toBe('pending_input');
    expect(
        (
            await callback(token, {
                kind: 'stop',
                sessionId,
                promptId,
                backgroundTasks: 0,
                lastAssistantMessage: 'Waiting for Haus',
            })
        ).body.settled
    ).toBe(false);
    await fixture.harness.restart();
    expect(
        (await post('/api/agent/cloud-agents/input/answer', runner.token, { id: input.id, answer }))
            .status
    ).toBe(200);
    expect(
        (await post('/api/agent/cloud-agents/input/answer', runner.token, { id: input.id, answer }))
            .status
    ).toBe(200);
    expect(
        (
            await post('/api/agent/cloud-agents/input/answer', runner.token, {
                id: input.id,
                answer: { ...answer, 'Which fixture value should we use?': 'beta' },
            })
        ).status
    ).toBe(409);
    expect((await fixture.readWork(workId))?.status).toBe('pending_input');
    const resume = { sessionId, promptId: randomUUID() };
    expect((await callback(token, { kind: 'prompt', ...resume, requestId: input.id })).status).toBe(
        200
    );
    const continued = await callback(token, {
        kind: 'question',
        ...resume,
        toolUseId: 'question-resumed',
        questions,
    });
    expect(cloudAgentInputRequestSchema.parse(continued.body.request).id).toBe(input.id);
    const receipt = {
        kind: 'consume',
        ...resume,
        toolUseId: 'question-resumed',
        id: input.id,
        answer,
    };
    expect((await callback(token, { ...receipt, sessionId: randomUUID() })).status).toBe(409);
    expect((await callback(token, receipt)).status).toBe(200);
    expect((await callback(token, receipt)).status).toBe(200);
    expect((await callback(token, { ...receipt, toolUseId: 'wrong-tool' })).status).toBe(409);
    expect((await fixture.readWork(workId))?.status).toBe('running');
    expect(
        (
            await callback(token, {
                kind: 'stop',
                sessionId,
                promptId,
                backgroundTasks: 0,
                lastAssistantMessage: 'Old delayed stop',
            })
        ).body.settled
    ).toBe(false);
    expect(
        (
            await callback(token, {
                kind: 'stop',
                ...resume,
                backgroundTasks: 1,
                lastAssistantMessage: 'Background work remains',
            })
        ).body.settled
    ).toBe(false);
    expect(
        (
            await callback(token, {
                kind: 'stop',
                ...resume,
                backgroundTasks: 0,
                lastAssistantMessage: 'Verified alpha',
            })
        ).body.settled
    ).toBe(true);
    expect((await fixture.readAttentions(runId)).length).toBe(1);
    const cancelled = await fixture.postCancel(runner, workId);
    expect(cancelled.status).toBe(409);
    expect((await fixture.readWork(workId))?.cancel_requested_at).toBeUndefined();
});

test('callback credentials cannot read another execution or answer as the delegating Agent', async () => {
    const runner = await fixture.mintRunner('input-scope');
    const start = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'input-scope', provider: 'claude' })
    );
    const workId = start.body.work?.id;
    const runId = start.body.runId;
    if (!(workId && runId)) {
        throw new Error('Missing cloud receipt');
    }
    const token = randomBytes(32).toString('base64url');
    await post('/api/agent/cloud-agents/callback-credential', runner.token, {
        workId,
        runId,
        token,
    });
    const sessionId = randomUUID();
    const promptId = randomUUID();
    await callback(token, { kind: 'prompt', sessionId, promptId });
    const created = await callback(token, {
        kind: 'question',
        sessionId,
        promptId,
        toolUseId: 'scope-question',
        questions,
    });
    const input = cloudAgentInputRequestSchema.parse(created.body.request);
    expect(
        (await post('/api/agent/cloud-agents/input/answer', token, { id: input.id, answer })).status
    ).toBe(401);
    expect(
        (
            await callback(randomBytes(32).toString('base64url'), {
                kind: 'consume',
                sessionId,
                promptId,
                toolUseId: 'scope-question',
                id: input.id,
                answer,
            })
        ).status
    ).toBe(401);
    const [credential] = await fixture.harness
        .sql`select token_hash from cloud_agent_callbacks where run_id=${runId}`;
    expect(credential.token_hash).not.toBe(token);
    expect(credential.token_hash.length).toBe(64);
    await fixture.harness.sql`update cloud_agent_input set state='cancelled' where id=${input.id}`;
    expect(
        (await post('/api/agent/cloud-agents/input/answer', runner.token, { id: input.id, answer }))
            .status
    ).toBe(409);
    expect(
        (
            await callback(token, {
                kind: 'prompt',
                sessionId,
                promptId: randomUUID(),
                requestId: input.id,
            })
        ).status
    ).toBe(409);
});

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
