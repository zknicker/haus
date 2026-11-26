import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { makeTestRuntime } from '@haus/effect';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { deleteExpiredInvocations } from '../src/agent-invocations/invocation-retention.ts';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { createHomedAgent } from './agent-home.fixture.ts';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const photo = randomBytes(2 * 1024 * 1024);
const day = 24 * 60 * 60 * 1000;
let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let runCredential: string;
let runId: string;
let chatId: string;
let laterCredential: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'invocation-uploads' });
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
    chatId = (
        await setup.owner.trpc.chat.ensureAgentDm.mutate({
            agentId: setup.agentId,
            serverId: setup.serverId,
        })
    ).id;
    await setup.owner.trpc.chat.send.mutate({
        chatId,
        content: 'Save the photo.',
        nonce: 'upload_turn',
        serverId: setup.serverId,
    });
    const start = await runner.next(frameOfType('runner-start'));
    runId = (start.start as { runId: string }).runId;
    runCredential = String(start.runCredential);
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('a 2 MiB haus write uploads under its dispatch key and reaches the machine intact', async () => {
    const uploaded = await upload('toolu_write', 0, runCredential);
    expect(uploaded.status).toBe(200);
    const reference = { ...((await uploaded.json()) as object), kind: 'attachment' };
    expect(reference).toEqual({
        attachmentId: expect.stringMatching(/^att_[A-Za-z0-9_-]{16}$/u),
        kind: 'attachment',
        mediaType: 'application/octet-stream',
        sha256: digest(photo),
        sizeBytes: photo.byteLength,
    });
    const { attachmentId } = reference as { attachmentId: string };
    expect((await get(`/api/agent/attachments/${attachmentId}`, runCredential)).status).toBe(404);
    expect(
        (await get(`/api/agent/invocation-payloads/${attachmentId}`, runCredential)).status
    ).toBe(404);

    const invocationId = await requestWrite(setup.agentId, runId, 'toolu_write', reference);
    const read = await get(
        `/computer/invocations/${invocationId}/payloads/${attachmentId}`,
        setup.computerCredential
    );
    expect(read.status).toBe(200);
    expect(digest(Buffer.from(await read.arrayBuffer()))).toBe(digest(photo));

    computer.send({ invocationId, type: 'invoke-accepted' });
    computer.send({
        invocationId,
        outcome: 'completed',
        output: { kind: 'text', text: 'Wrote 2097152 bytes to ./photo.jpg.' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_write' }))
    ).toMatchObject({ invocationId, outcome: 'completed' });
    expect((await get(`/api/agent/attachments/${attachmentId}`, runCredential)).status).toBe(404);
    expect((await upload('toolu_write', 0, runCredential)).status).toBe(409);
    expect((await upload('toolu_write', 1, 'grtr_unknown')).status).toBe(401);
});

test('another run, tool call, or Agent cannot bind an upload, and a later run cannot read it', async () => {
    const reference = {
        ...((await (await upload('toolu_secret', 0, runCredential)).json()) as object),
        kind: 'attachment',
    };
    const { attachmentId } = reference as { attachmentId: string };
    const otherAgentId = (
        await createHomedAgent(setup.owner, {
            computerId: setup.computerId,
            displayName: 'Echo',
            handle: 'echo',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId: setup.serverId,
        })
    ).agent.id;
    const strangers = [
        await requestWrite(setup.agentId, 'run_other', 'toolu_secret', reference),
        await requestWrite(setup.agentId, runId, 'toolu_stranger', reference),
        await requestWrite(otherAgentId, runId, 'toolu_secret', reference),
    ];
    const reads = await Promise.all(
        strangers.map((invocationId) =>
            get(
                `/computer/invocations/${invocationId}/payloads/${attachmentId}`,
                setup.computerCredential
            )
        )
    );
    expect(reads.map((response) => response.status)).toEqual([404, 404, 404]);

    const own = await requestWrite(setup.agentId, runId, 'toolu_secret', reference);
    expect(
        (
            await get(
                `/computer/invocations/${own}/payloads/${attachmentId}`,
                setup.computerCredential
            )
        ).status
    ).toBe(200);
    expect(
        (await get(`/api/agent/invocation-payloads/${attachmentId}`, runCredential)).status
    ).toBe(200);

    laterCredential = await laterRunCredential();
    expect(
        (await get(`/api/agent/invocation-payloads/${attachmentId}`, laterCredential)).status
    ).toBe(404);
    expect((await get(`/api/agent/attachments/${attachmentId}`, laterCredential)).status).toBe(404);
});

test('an upload no invocation ever bound expires with its bytes after the retention window', async () => {
    const uploaded = await upload('toolu_orphan', 0, laterCredential);
    expect(uploaded.status).toBe(200);
    const orphan = (await uploaded.json()) as { attachmentId: string };
    const connection = await connectHausDatabase(setup.harness.databaseUrl);
    const root = await openAttachmentRoot(setup.harness.attachmentRoot, makeTestRuntime());
    try {
        await deleteExpiredInvocations(connection.db, root, new Date(Date.now() + 29 * day));
        expect(await rowsFor(orphan.attachmentId)).toEqual([{ attachments: 1, payloads: 1 }]);
        await deleteExpiredInvocations(connection.db, root, new Date(Date.now() + 31 * day));
        expect(await rowsFor(orphan.attachmentId)).toEqual([{ attachments: 0, payloads: 0 }]);
    } finally {
        await connection.close();
    }
});

async function rowsFor(attachmentId: string) {
    return await setup.harness.sql`
        select
            (select count(*)::int from attachments where id = ${attachmentId}) as attachments,
            (select count(*)::int from agent_invocation_payloads where attachment_id = ${attachmentId}) as payloads
    `;
}

async function requestWrite(agentId: string, run: string, toolCallId: string, bytes: object) {
    runner.send({
        agentId,
        operation: { bytes, kind: 'file-write', mode: 0o600, path: './photo.jpg' },
        runId: run,
        seq: 0,
        sessionGeneration: 1,
        toolCallId,
        type: 'invocation-request',
    });
    const invoke = await computer.next(
        (frame) =>
            frame.type === 'invoke' &&
            frame.agentId === agentId &&
            frame.runId === run &&
            !claimedInvocations.has(String(frame.invocationId))
    );
    claimedInvocations.add(String(invoke.invocationId));
    expect(invoke.operation).toEqual({
        bytes,
        kind: 'file-write',
        mode: 0o600,
        path: './photo.jpg',
    });
    return String(invoke.invocationId);
}

const claimedInvocations = new Set<string>();

async function laterRunCredential() {
    const settled = new Promise<void>((resolve) => {
        const stop = onAgentLifecycle((event) => {
            if (event.runId === runId && event.phase === 'settled') {
                stop();
                resolve();
            }
        });
    });
    runner.send({ agentId: setup.agentId, runId, type: 'ack' });
    runner.send(settledTurn());
    await settled;
    await setup.owner.trpc.chat.send.mutate({
        chatId,
        content: 'And the next one?',
        nonce: 'upload_turn_later',
        serverId: setup.serverId,
    });
    const later = await runner.next(
        (frame) =>
            frame.type === 'runner-start' && (frame.start as { runId: string }).runId !== runId
    );
    return String(later.runCredential);
}

async function upload(toolCallId: string, seq: number, credential: string) {
    const url = new URL('/api/agent/invocation-payloads', setup.harness.url);
    url.searchParams.set('toolCallId', toolCallId);
    url.searchParams.set('seq', String(seq));
    return await fetch(url, {
        body: photo,
        headers: {
            authorization: `Bearer ${credential}`,
            'content-type': 'application/octet-stream',
        },
        method: 'PUT',
    });
}

async function get(path: string, credential: string) {
    return await fetch(new URL(path, setup.harness.url), {
        headers: { authorization: `Bearer ${credential}` },
    });
}

function settledTurn() {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: setup.agentId,
        endedAt: now,
        messageCount: 0,
        modelId: 'gpt-5.6-sol',
        outputProduced: true,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Saved the photo.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

function digest(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
}
