import { afterEach, beforeEach, expect, test } from 'bun:test';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EditorCommand } from '@haus/api';
import { editRunner } from './editor.ts';
import { type InvocationPayloads, inlinePayloads } from './operation.ts';
import { digest, serveInvocationPayloads } from './payload-server.test-support.ts';
import { createInvocationPayloads } from './payloads.ts';

const fixture = join(import.meta.dir, 'fixtures', 'two-pages.pdf');
let root = '';
let server: ReturnType<typeof serveInvocationPayloads>;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-editor-pdf-'));
    server = serveInvocationPayloads();
});

afterEach(async () => {
    await server.stop();
    await rm(root, { force: true, recursive: true });
});

test('view returns a PDF as application/pdf bytes, found by its magic bytes', async () => {
    await copyFile(fixture, join(root, 'report'));

    expect(await view('report')).toEqual({
        outcome: 'completed',
        output: {
            base64: (await readFile(fixture)).toString('base64'),
            kind: 'inline',
            mediaType: 'application/pdf',
        },
        truncated: false,
    });
});

test('a .pdf name without PDF magic bytes is viewed as text', async () => {
    await writeFile(join(root, 'notes.pdf'), 'not really a pdf\n');

    expect(await view('notes.pdf')).toEqual({
        outcome: 'completed',
        output: { kind: 'text', text: '     1\tnot really a pdf' },
        truncated: false,
    });
});

test('a PDF over 700 KiB streams to the Server and one over 5 MiB is refused', async () => {
    const large = pdfOfSize(2 * 1024 * 1024);
    const huge = pdfOfSize(6 * 1024 * 1024);
    await writeFile(join(root, 'large.pdf'), large);
    await writeFile(join(root, 'huge.pdf'), huge);
    const payloads = createInvocationPayloads({
        credential: 'computer-credential',
        invocationId: 'invocation-pdf',
        serverOrigin: server.http.url.origin,
    });

    expect(await view('large.pdf', payloads)).toEqual({
        outcome: 'completed',
        output: {
            attachmentId: 'attachment-1',
            kind: 'attachment',
            mediaType: 'application/pdf',
            sha256: digest(large),
            sizeBytes: large.byteLength,
        },
        truncated: false,
    });
    expect(await view('huge.pdf', payloads)).toEqual({
        outcome: 'failed',
        output: { kind: 'text', text: 'PDF is 6.0MB; the limit is 5 MiB.' },
        truncated: false,
    });
    expect(server.uploads.map((upload) => upload.contentType)).toEqual(['application/pdf']);
});

function view(path: string, payloads: InvocationPayloads = inlinePayloads) {
    const edit: EditorCommand = { command: 'view', path };
    return editRunner(
        { edit, kind: 'edit' },
        {
            agentId: 'agent_pdf',
            cwd: root,
            env: { HOME: join(root, 'home') },
            invocationId: 'invocation-pdf',
            logPath: join(root, 'invocation.log'),
            payloads,
            signal: new AbortController().signal,
            timeoutMs: 30_000,
        }
    );
}

function pdfOfSize(sizeBytes: number) {
    const bytes = new Uint8Array(sizeBytes).fill(0x20);
    bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
    return bytes;
}
