import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const image = Buffer.concat([pngHeader, Buffer.alloc(900 * 1024, 7)]);
let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let runCredential: string;
let firstRunId: string;
let chatId: string;
let ownInvocationId: string;
let otherInvocationId: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'invocation-payloads' });
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
        content: 'Look at the screenshot.',
        nonce: 'payload_turn',
        serverId: setup.serverId,
    });
    const start = await runner.next(frameOfType('runner-start'));
    firstRunId = (start.start as { runId: string }).runId;
    runCredential = String(start.runCredential);
    ownInvocationId = await invoke(firstRunId, 'toolu_view');
    otherInvocationId = await invoke('run_other', 'toolu_other');
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('the Computer stores a payload under its invocation and reads back the same bytes', async () => {
    const stored = await upload(ownInvocationId, setup.computerCredential, image);

    expect(stored.status).toBe(200);
    const reference = (await stored.json()) as { attachmentId: string };
    expect(reference).toEqual({
        attachmentId: expect.stringMatching(/^att_[A-Za-z0-9_-]{16}$/u),
        mediaType: 'image/png',
        sha256: digest(image),
        sizeBytes: image.byteLength,
    });

    const read = await download(
        `/computer/invocations/${ownInvocationId}/payloads/${reference.attachmentId}`,
        setup.computerCredential
    );
    expect(read.status).toBe(200);
    expect(read.headers.get('content-type')).toBe('image/png');
    expect(digest(Buffer.from(await read.arrayBuffer()))).toBe(digest(image));

    const misbound = await download(
        `/computer/invocations/${otherInvocationId}/payloads/${reference.attachmentId}`,
        setup.computerCredential
    );
    expect(misbound.status).toBe(404);
});

test('a wrong Computer credential or an invocation never sent stores nothing', async () => {
    expect((await upload(ownInvocationId, 'not-this-computer', image)).status).toBe(401);
    expect((await upload('inv_neverSentHere000', setup.computerCredential, image)).status).toBe(
        404
    );
    expect(
        await setup.harness.sql`
            select count(*)::int as ready from attachments a
            join agent_invocation_payloads p on p.attachment_id = a.id
            where a.state = 'ready'
        `
    ).toEqual([{ ready: 1 }]);
});

test('a run reads only payloads of its own invocations', async () => {
    const own = (await (await upload(ownInvocationId, setup.computerCredential, image)).json()) as {
        attachmentId: string;
    };
    const other = (await (
        await upload(otherInvocationId, setup.computerCredential, image)
    ).json()) as { attachmentId: string };

    const read = await download(
        `/api/agent/invocation-payloads/${own.attachmentId}`,
        runCredential
    );
    expect(read.status).toBe(200);
    expect(digest(Buffer.from(await read.arrayBuffer()))).toBe(digest(image));
    expect(
        (await download(`/api/agent/invocation-payloads/${other.attachmentId}`, runCredential))
            .status
    ).toBe(404);
    expect(
        (await download(`/api/agent/invocation-payloads/${own.attachmentId}`, 'grtr_unknown'))
            .status
    ).toBe(401);
});

test('a payload never reads or attaches through the general attachment routes, even for a later run', async () => {
    const payload = (await (
        await upload(ownInvocationId, setup.computerCredential, image)
    ).json()) as { attachmentId: string };
    const general = `/api/agent/attachments/${payload.attachmentId}`;

    expect((await download(general, runCredential)).status).toBe(404);
    expect(
        (await download(`/api/agent/invocation-payloads/${payload.attachmentId}`, runCredential))
            .status
    ).toBe(200);
    const attached = await fetch(new URL('/api/agent/messages/send', setup.harness.url), {
        body: JSON.stringify({
            attachmentIds: [payload.attachmentId],
            content: 'Here it is.',
            nonce: 'payload_attach',
            target: 'dm:@ada',
        }),
        headers: { authorization: `Bearer ${runCredential}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect({ body: await attached.json(), status: attached.status }).toEqual({
        body: {
            code: 'INVALID_ARG',
            message:
                'Every attachment must be ready, unassociated, and owned by this message author.',
        },
        status: 400,
    });
    expect(
        await setup.harness.sql`
            select message_id from attachments where id = ${payload.attachmentId}
        `
    ).toEqual([{ message_id: null }]);

    const settled = new Promise<void>((resolve) => {
        const stop = onAgentLifecycle((event) => {
            if (event.runId === firstRunId && event.phase === 'settled') {
                stop();
                resolve();
            }
        });
    });
    runner.send({ agentId: setup.agentId, runId: firstRunId, type: 'ack' });
    runner.send(settledTurn(firstRunId));
    await settled;
    await setup.owner.trpc.chat.send.mutate({
        chatId,
        content: 'And the next one?',
        nonce: 'payload_turn_later',
        serverId: setup.serverId,
    });
    const later = await runner.next(
        (frame) =>
            frame.type === 'runner-start' && (frame.start as { runId: string }).runId !== firstRunId
    );
    expect((await download(general, String(later.runCredential))).status).toBe(404);
});

async function invoke(runId: string, toolCallId: string) {
    runner.send(invocationRequest(setup.agentId, runId, toolCallId));
    const frame = await computer.next(frameOfType('invoke', { runId }));
    computer.send({ invocationId: frame.invocationId, type: 'invoke-accepted' });
    return String(frame.invocationId);
}

async function upload(invocationId: string, credential: string, bytes: Buffer) {
    return await fetch(
        new URL(`/computer/invocations/${invocationId}/payloads`, setup.harness.url),
        {
            body: bytes,
            headers: { authorization: `Bearer ${credential}`, 'content-type': 'image/png' },
            method: 'PUT',
        }
    );
}

async function download(path: string, credential: string) {
    return await fetch(new URL(path, setup.harness.url), {
        headers: { authorization: `Bearer ${credential}` },
    });
}

function settledTurn(runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: setup.agentId,
        endedAt: now,
        messageCount: 0,
        modelId: 'gpt-5.6-sol',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Looked at the screenshot.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

function digest(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
}
