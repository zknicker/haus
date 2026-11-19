import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type InvocationOperation,
    type InvokeAccepted,
    type InvokeResult,
    invocationFrameMaxBytes,
} from '@haus/api';
import { invocationRunners } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';
import { digest, serveInvocationPayloads } from './payload-server.test-support.ts';
import { createInvocationPayloads } from './payloads.ts';

const credential = 'computer-credential';
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let root: string;
let server: ReturnType<typeof serveInvocationPayloads>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-large-payload-'));
    server = serveInvocationPayloads();
});

afterEach(async () => {
    await server.stop();
    await rm(root, { force: true, recursive: true });
});

describe('large invocation payloads', () => {
    test('a 2 MiB image result streams to the Server and the frame carries its reference', async () => {
        const image = new Uint8Array([...pngSignature, ...randomBytes(2 * 1024 * 1024)]);
        const path = join(root, 'large.png');
        await writeFile(path, image);
        const { results } = await invoke({ kind: 'view-image', path });
        expect(server.uploads).toHaveLength(1);
        const [upload] = server.uploads;
        expect(upload?.invocationId).toBe('invocation-1');
        expect(upload?.authorization).toBe(`Bearer ${credential}`);
        expect(upload?.contentType).toBe('image/png');
        expect(Buffer.from(upload?.bytes ?? []).equals(image)).toBe(true);
        expect(results).toEqual([
            {
                invocationId: 'invocation-1',
                outcome: 'completed',
                output: {
                    attachmentId: 'attachment-1',
                    kind: 'attachment',
                    mediaType: 'image/png',
                    sha256: digest(image),
                    sizeBytes: image.byteLength,
                },
                truncated: false,
                type: 'invoke-result',
            },
        ]);
    });

    test('a file write whose bytes are a 2 MiB reference downloads them and writes the file', async () => {
        const bytes = new Uint8Array(randomBytes(2 * 1024 * 1024));
        server.attachments.set('attachment-in', bytes);
        const path = join(root, 'written.bin');
        const { results } = await invoke({
            bytes: {
                attachmentId: 'attachment-in',
                kind: 'attachment',
                mediaType: 'application/octet-stream',
                sha256: digest(bytes),
                sizeBytes: bytes.byteLength,
            },
            kind: 'file-write',
            mode: 0o644,
            path,
        });
        expect(results.map((result) => result.outcome)).toEqual(['completed']);
        expect(Buffer.from(await readFile(path)).equals(bytes)).toBe(true);
        expect(server.downloads).toEqual([
            {
                authorization: `Bearer ${credential}`,
                path: '/computer/invocations/invocation-1/payloads/attachment-in',
            },
        ]);
    });

    test('a missing download fails and writes nothing', async () => {
        const path = join(root, 'missing.bin');
        const { results } = await invoke({
            bytes: {
                attachmentId: 'attachment-gone',
                kind: 'attachment',
                mediaType: 'application/octet-stream',
                sha256: '0'.repeat(64),
                sizeBytes: 2 * 1024 * 1024,
            },
            kind: 'file-write',
            mode: 0o644,
            path,
        });
        expect(results).toEqual([
            {
                invocationId: 'invocation-1',
                outcome: 'failed',
                output: {
                    kind: 'text',
                    text: `Could not fetch the bytes for ${path}: The invocation payload could not be downloaded (HTTP 404). Nothing was written.`,
                },
                truncated: false,
                type: 'invoke-result',
            },
        ]);
        expect(await Bun.file(path).exists()).toBe(false);
    });

    test('a download whose sha256 does not match its reference fails and writes nothing', async () => {
        const bytes = new Uint8Array(randomBytes(2 * 1024 * 1024));
        server.attachments.set('attachment-in', bytes);
        const path = join(root, 'tampered.bin');
        const { results } = await invoke({
            bytes: {
                attachmentId: 'attachment-in',
                kind: 'attachment',
                mediaType: 'application/octet-stream',
                sha256: 'f'.repeat(64),
                sizeBytes: bytes.byteLength,
            },
            kind: 'file-write',
            mode: 0o644,
            path,
        });
        expect(results.map((result) => [result.outcome, result.output])).toEqual([
            [
                'failed',
                {
                    kind: 'text',
                    text: `Could not fetch the bytes for ${path}: The downloaded invocation payload does not match its reference. Nothing was written.`,
                },
            ],
        ]);
        expect(await Bun.file(path).exists()).toBe(false);
    });

    test('a small file read stays inline and uploads nothing', async () => {
        const path = join(root, 'note.txt');
        await writeFile(path, 'hello');
        const { results } = await invoke({ kind: 'file-read', maxBytes: 1024, path });
        expect(results.map((result) => result.output)).toEqual([
            {
                base64: Buffer.from('hello').toString('base64'),
                kind: 'inline',
                mediaType: 'application/octet-stream',
            },
        ]);
        expect(server.uploads).toEqual([]);
    });
});

describe('stopped payload transfers', () => {
    test('a cancel during an upload settles cancelled and the next invocation runs', async () => {
        server.hold.enabled = true;
        const path = join(root, 'large.png');
        await writeFile(path, new Uint8Array([...pngSignature, ...randomBytes(2 * 1024 * 1024)]));
        const notePath = join(root, 'note.txt');
        await writeFile(notePath, 'next');
        const { handler, results } = await startHandler();

        handler.receive(invokeFrame('invocation-1', { kind: 'view-image', path }, 30_000));
        handler.receive(
            invokeFrame('invocation-2', { kind: 'file-read', maxBytes: 1024, path: notePath })
        );
        await server.hold.arrived.promise;
        handler.receive({ invocationId: 'invocation-1', type: 'invoke-cancel' });
        await handler.settled();

        expect(server.hold.requests).toEqual(['PUT /computer/invocations/invocation-1/payloads']);
        expect(results()).toEqual([
            {
                invocationId: 'invocation-1',
                outcome: 'cancelled',
                output: { kind: 'text', text: `Stopped before returning ${path}.` },
                truncated: false,
                type: 'invoke-result',
            },
            nextResult,
        ]);
    });

    test('a timeout during a download settles timed-out and the next invocation runs', async () => {
        server.hold.enabled = true;
        const path = join(root, 'written.bin');
        const notePath = join(root, 'note.txt');
        await writeFile(notePath, 'next');
        const { handler, results } = await startHandler();

        handler.receive(
            invokeFrame(
                'invocation-1',
                {
                    bytes: {
                        attachmentId: 'attachment-in',
                        kind: 'attachment',
                        mediaType: 'application/octet-stream',
                        sha256: '0'.repeat(64),
                        sizeBytes: 2 * 1024 * 1024,
                    },
                    kind: 'file-write',
                    mode: 0o644,
                    path,
                },
                500
            )
        );
        handler.receive(
            invokeFrame('invocation-2', { kind: 'file-read', maxBytes: 1024, path: notePath })
        );
        await handler.settled();

        expect(server.hold.requests).toEqual([
            'GET /computer/invocations/invocation-1/payloads/attachment-in',
        ]);
        expect(results()).toEqual([
            {
                invocationId: 'invocation-1',
                outcome: 'timed-out',
                output: {
                    kind: 'text',
                    text: `Stopped before writing ${path}. Nothing was written.`,
                },
                truncated: false,
                type: 'invoke-result',
            },
            nextResult,
        ]);
        expect(await Bun.file(path).exists()).toBe(false);
    });
});

const nextResult = {
    invocationId: 'invocation-2',
    outcome: 'completed',
    output: {
        base64: Buffer.from('next').toString('base64'),
        kind: 'inline',
        mediaType: 'application/octet-stream',
    },
    truncated: false,
    type: 'invoke-result',
} satisfies InvokeResult;

async function invoke(operation: InvocationOperation) {
    const { handler, results, sent } = await startHandler();
    expect(handler.receive(invokeFrame('invocation-1', operation))).toBe(true);
    await handler.settled();
    for (const frame of sent) {
        expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThan(invocationFrameMaxBytes);
    }
    return { results: results() };
}

async function startHandler() {
    const sent: (InvokeAccepted | InvokeResult)[] = [];
    const agentsRoot = join(root, 'servers', 'server-1', 'agents');
    const handler = await createInvocationHandler({
        agentsRoot,
        payloadsFor: (invocationId) =>
            createInvocationPayloads({
                credential,
                invocationId,
                serverOrigin: server.http.url.origin,
            }),
        runners: invocationRunners(agentsRoot),
        send: (frame) => {
            sent.push(frame);
            return true;
        },
    });
    return {
        handler,
        results: () =>
            sent.filter((frame): frame is InvokeResult => frame.type === 'invoke-result'),
        sent,
    };
}

function invokeFrame(invocationId: string, operation: InvocationOperation, timeoutMs = 60_000) {
    return {
        agentId: 'agent-1',
        invocationId,
        operation,
        runId: 'run-1',
        timeoutMs,
        type: 'invoke',
    };
}
