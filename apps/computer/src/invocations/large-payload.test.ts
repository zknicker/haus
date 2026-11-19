import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type InvocationOperation,
    type InvokeAccepted,
    type InvokeResult,
    invocationFrameMaxBytes,
} from '@haus/api';
import { bashRunner } from './bash.ts';
import { createBrowserRunner } from './browser.ts';
import { editRunner } from './editor.ts';
import { fileReadRunner, fileWriteRunner, viewImageRunner } from './files.ts';
import { createInvocationHandler } from './handler.ts';
import { createInvocationPayloads } from './payloads.ts';

const credential = 'computer-credential';
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface ReceivedUpload {
    authorization: string | null;
    bytes: Uint8Array;
    contentType: string | null;
    invocationId: string;
}

let root: string;
let server: ReturnType<typeof serveInvocationPayloads>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-large-payload-'));
    server = serveInvocationPayloads();
});

afterEach(async () => {
    await server.http.stop(true);
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

async function invoke(operation: InvocationOperation) {
    const sent: (InvokeAccepted | InvokeResult)[] = [];
    const handler = await createInvocationHandler({
        agentsRoot: join(root, 'servers', 'server-1', 'agents'),
        payloadsFor: (invocationId) =>
            createInvocationPayloads({
                credential,
                invocationId,
                serverOrigin: server.http.url.origin,
            }),
        runners: {
            bash: bashRunner,
            browser: createBrowserRunner({ browserRoot: join(root, 'browser') }),
            edit: editRunner,
            'file-read': fileReadRunner,
            'file-write': fileWriteRunner,
            'view-image': viewImageRunner,
        },
        send: (frame) => {
            sent.push(frame);
            return true;
        },
    });
    expect(
        handler.receive({
            agentId: 'agent-1',
            invocationId: 'invocation-1',
            operation,
            runId: 'run-1',
            timeoutMs: 60_000,
            type: 'invoke',
        })
    ).toBe(true);
    await handler.settled();
    for (const frame of sent) {
        expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThan(invocationFrameMaxBytes);
    }
    return {
        results: sent.filter((frame): frame is InvokeResult => frame.type === 'invoke-result'),
    };
}

function serveInvocationPayloads() {
    const uploads: ReceivedUpload[] = [];
    const downloads: { authorization: string | null; path: string }[] = [];
    const attachments = new Map<string, Uint8Array>();
    const http = Bun.serve({
        port: 0,
        fetch: async (request) => {
            const url = new URL(request.url);
            const [, computer, invocations, invocationId, payloads, attachmentId] =
                url.pathname.split('/');
            if (
                computer !== 'computer' ||
                invocations !== 'invocations' ||
                payloads !== 'payloads' ||
                !invocationId
            ) {
                return new Response('Not found', { status: 404 });
            }
            const authorization = request.headers.get('authorization');
            if (request.method === 'PUT' && !attachmentId) {
                const bytes = new Uint8Array(await request.arrayBuffer());
                const contentType = request.headers.get('content-type');
                uploads.push({ authorization, bytes, contentType, invocationId });
                const id = `attachment-${uploads.length}`;
                attachments.set(id, bytes);
                return Response.json({
                    attachmentId: id,
                    mediaType: contentType,
                    sha256: digest(bytes),
                    sizeBytes: bytes.byteLength,
                });
            }
            if (request.method === 'GET' && attachmentId) {
                downloads.push({ authorization, path: url.pathname });
                const bytes = attachments.get(attachmentId);
                return bytes ? new Response(bytes) : new Response('Not found', { status: 404 });
            }
            return new Response('Method not allowed', { status: 405 });
        },
    });
    return { attachments, downloads, http, uploads };
}

function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}
